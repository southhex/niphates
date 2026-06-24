// Server-side Sanctum (journal) settings and entry management.
//
// Settings live in data/sanctum.json (connector + folder + filename template).
// Entries are real files in the chosen connector's vault/folder, read/written
// directly via the Node fs API. Server-only.

import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createJsonStore } from "./jsonStore";

// --- Types -----------------------------------------------------------------

export interface SanctumSettings {
  /** Connector id from the connectors registry. */
  connectorId: string;
  /** Folder path within the vault (relative to vault root). */
  folder: string;
  /**
   * Filename template using date-fns format tokens (e.g. "yyyy-MM-dd").
   * New entries get this format applied to today's date.
   */
  filenameTemplate: string;
  /**
   * Per-entry word count goal driving the progress bar. 0 (or absent) means
   * no goal — the progress bar is hidden.
   */
  wordGoal: number;
}

export interface JournalEntry {
  filename: string;
  displayName: string;
  folder: string;
  createdAt: number;
  updatedAt: number;
  size: number;
  /** Word count of the entry body (frontmatter excluded). */
  wordCount: number;
}

/**
 * Count words in an entry body, ignoring YAML frontmatter and markdown
 * punctuation. Kept in sync with the client-side countWords in SanctumView so
 * the list heatmap and the live editor count agree.
 */
export function countEntryWords(text: string): number {
  if (!text) return 0;
  const body = text.replace(/^---\n[\s\S]*?\n---\n?/, "");
  const matches = body
    .replace(/[#>*_`~\-[\]()]/g, " ")
    .match(/\b[\p{L}\p{N}'’-]+\b/gu);
  return matches ? matches.length : 0;
}

// --- Default settings ------------------------------------------------------

function defaultSettings(): SanctumSettings {
  return {
    connectorId: "",
    folder: "Journal",
    filenameTemplate: "yyyy-MM-dd",
    wordGoal: 0,
  };
}

// --- Store -----------------------------------------------------------------

const settingsStore = createJsonStore<SanctumSettings>({
  filename: "sanctum.json",
  seed: defaultSettings,
  // Fill in newly-added fields (e.g. wordGoal) under the stored values so
  // existing installs don't read back `undefined`.
  merge: (seed, parsed) => ({ ...seed, ...parsed }),
});

export async function getSanctumSettings(): Promise<SanctumSettings> {
  return settingsStore.read();
}

// --- Word-count cache ------------------------------------------------------
//
// Counting words means reading the whole file, and listEntries now spans every
// day in the journal — so re-reading every file on each list call is wasteful.
// We cache the count per file, keyed by the connector + relative path, and
// validate the cache entry against the file's (mtimeMs, size). A write changes
// mtime, so stale entries are detected automatically — no explicit
// invalidation needed. The cache lives in data/sanctum-wordcounts.json.

interface WordCountEntry {
  mtimeMs: number;
  size: number;
  words: number;
}

type WordCountCache = Record<string, WordCountEntry>;

const wordCountStore = createJsonStore<WordCountCache>({
  filename: "sanctum-wordcounts.json",
  seed: () => ({}),
});

/**
 * Resolve word counts for a batch of files, reading from disk only on a cache
 * miss (file absent from cache, or its mtime/size changed). Persists any newly
 * computed counts in a single serialized update. The cache is also pruned of
 * keys not present in the current batch, so deleted files don't accumulate.
 */
async function resolveWordCounts(
  namespace: string,
  inputs: Array<{ key: string; filePath: string; mtimeMs: number; size: number }>,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();

  // Read uncached files up front (outside the store lock, so concurrent list
  // calls don't serialize on disk reads).
  const cache = await wordCountStore.read();
  const fresh: Record<string, WordCountEntry> = {};
  for (const { key, filePath, mtimeMs, size } of inputs) {
    const hit = cache[key];
    if (hit && hit.mtimeMs === mtimeMs && hit.size === size) {
      out.set(key, hit.words);
      continue;
    }
    const content = await fs.readFile(filePath, "utf8").catch(() => "");
    const words = countEntryWords(content);
    out.set(key, words);
    fresh[key] = { mtimeMs, size, words };
  }

  const wantedKeys = new Set(inputs.map((i) => i.key));
  const nsCachedCount = Object.keys(cache).filter((k) =>
    k.startsWith(`${namespace} `),
  ).length;
  // A write is needed only if we computed fresh counts, or files in this
  // namespace disappeared (cached count for the namespace exceeds the batch).
  // The store always rewrites on update(), so we gate the call to avoid an
  // unnecessary atomic write on the common all-cache-hit path.
  const needsWrite =
    Object.keys(fresh).length > 0 || nsCachedCount > inputs.length;

  if (needsWrite) {
    // Serialized update so concurrent writers don't clobber each other. Only
    // touch keys in THIS namespace: keep other journals' caches, drop entries
    // for files that vanished from this journal, write fresh counts.
    await wordCountStore.update((current) => {
      const next: WordCountCache = {};
      for (const [k, v] of Object.entries(current)) {
        if (k.startsWith(`${namespace} `) && !wantedKeys.has(k)) continue;
        next[k] = v;
      }
      for (const [k, v] of Object.entries(fresh)) next[k] = v;
      return next;
    });
  }

  return out;
}

export async function saveSanctumSettings(
  settings: SanctumSettings,
): Promise<SanctumSettings> {
  return settingsStore.write(settings);
}

// --- Connector resolution --------------------------------------------------

import { listConnectors } from "./resourceConnectors";
import type { Connector } from "./resourceConnectors";

/** Resolve a connector id to its vault root path. */
async function resolveVaultRoot(connectorId: string): Promise<string | null> {
  const connectors = await listConnectors();
  const conn = connectors.find((c) => c.id === connectorId);
  if (!conn) return null;
  if (conn.type === "obsidian-vault") {
    return (conn.config as { path: string }).path;
  }
  return null;
}

// --- Folder operations -----------------------------------------------------

/**
 * List subdirectories of a connector's vault (non-recursive), for the folder
 * picker. Returns folder paths relative to the vault root.
 */
export async function listFolders(connectorId: string): Promise<string[]> {
  const root = await resolveVaultRoot(connectorId);
  if (!root) return [];
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));
    return dirs;
  } catch {
    return [];
  }
}

// --- Entry operations ------------------------------------------------------

/**
 * Resolve an entry filename to an absolute path inside the journal folder,
 * defending against path traversal WITHOUT mangling legitimate names.
 *
 * Real on-disk filenames can contain spaces, apostrophes, unicode, etc. The
 * old approach rewrote those to `_`, so reading/writing an existing entry with
 * such a name 404'd. Instead we take only the basename (which discards any
 * `/`, `..`, or absolute prefix) and verify the result stays within the folder.
 * Returns null if the name escapes the folder or is empty.
 */
function resolveEntryPath(folderAbs: string, filename: string): string | null {
  const base = path.basename(filename.trim());
  if (!base || base === "." || base === "..") return null;
  const name = base.endsWith(".md") ? base : `${base}.md`;
  const full = path.resolve(folderAbs, name);
  // Must live directly inside the folder (basename already guarantees this,
  // but verify the containment explicitly as defence in depth).
  if (path.dirname(full) !== path.resolve(folderAbs)) return null;
  return full;
}

/** List all .md files in the configured folder, newest first. */
export async function listEntries(
  settings: SanctumSettings,
): Promise<JournalEntry[]> {
  const root = await resolveVaultRoot(settings.connectorId);
  if (!root) return [];
  const folderPath = path.join(root, settings.folder);
  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const mdFiles = entries.filter(
      (e) => e.isFile() && e.name.endsWith(".md"),
    );

    // Stat every file, then resolve word counts through the cache (one read
    // per changed/new file, none for unchanged files).
    const stats = await Promise.all(
      mdFiles.map(async (f) => {
        const filePath = path.join(folderPath, f.name);
        const stat = await fs.stat(filePath);
        return { name: f.name, filePath, stat };
      }),
    );

    // Namespace cache keys per journal (connector + folder) so different
    // journals don't collide and pruning stays scoped to the active one.
    const namespace = `${settings.connectorId} ${settings.folder}`;
    const keyOf = (name: string) => `${namespace} ${name}`;

    const counts = await resolveWordCounts(
      namespace,
      stats.map((s) => ({
        key: keyOf(s.name),
        filePath: s.filePath,
        mtimeMs: s.stat.mtimeMs,
        size: s.stat.size,
      })),
    );

    const results: JournalEntry[] = stats.map((s) => ({
      filename: s.name,
      displayName: s.name.replace(/\.md$/, ""),
      folder: settings.folder,
      createdAt: s.stat.birthtimeMs,
      updatedAt: s.stat.mtimeMs,
      size: s.stat.size,
      wordCount: counts.get(keyOf(s.name)) ?? 0,
    }));
    results.sort((a, b) => b.updatedAt - a.updatedAt);
    return results;
  } catch {
    return [];
  }
}

/** Read a single entry's content. */
export async function readEntry(
  settings: SanctumSettings,
  filename: string,
): Promise<string | null> {
  const root = await resolveVaultRoot(settings.connectorId);
  if (!root) return null;
  const filePath = resolveEntryPath(path.join(root, settings.folder), filename);
  if (!filePath) return null;
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

/** Write/update an entry (full content replacement). */
export async function writeEntry(
  settings: SanctumSettings,
  filename: string,
  content: string,
): Promise<boolean> {
  const root = await resolveVaultRoot(settings.connectorId);
  if (!root) return false;
  const filePath = resolveEntryPath(path.join(root, settings.folder), filename);
  if (!filePath) return false;
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
    return true;
  } catch {
    return false;
  }
}

/** Create a new entry file with the given filename (from the template). */
export async function createEntry(
  settings: SanctumSettings,
  filename: string,
  content: string,
): Promise<boolean> {
  const root = await resolveVaultRoot(settings.connectorId);
  if (!root) return false;
  const filePath = resolveEntryPath(path.join(root, settings.folder), filename);
  if (!filePath) return false;
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    // Write only if the file doesn't exist yet (don't overwrite).
    const existing = await fs.readFile(filePath, "utf8").catch(() => null);
    if (existing !== null) return false;
    await fs.writeFile(filePath, content, "utf8");
    return true;
  } catch {
    return false;
  }
}

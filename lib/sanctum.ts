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
}

export interface JournalEntry {
  filename: string;
  displayName: string;
  folder: string;
  createdAt: number;
  updatedAt: number;
  size: number;
}

// --- Default settings ------------------------------------------------------

function defaultSettings(): SanctumSettings {
  return {
    connectorId: "",
    folder: "Journal",
    filenameTemplate: "yyyy-MM-dd",
  };
}

// --- Store -----------------------------------------------------------------

const settingsStore = createJsonStore<SanctumSettings>({
  filename: "sanctum.json",
  seed: defaultSettings,
});

export async function getSanctumSettings(): Promise<SanctumSettings> {
  return settingsStore.read();
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

function sanitizeFilename(name: string): string {
  // Keep it simple: alphanumeric, dashes, underscores, dots. No path traversal.
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
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
    const results: JournalEntry[] = [];
    for (const f of mdFiles) {
      const filePath = path.join(folderPath, f.name);
      const stat = await fs.stat(filePath);
      results.push({
        filename: f.name,
        displayName: f.name.replace(/\.md$/, ""),
        folder: settings.folder,
        createdAt: stat.birthtimeMs,
        updatedAt: stat.mtimeMs,
        size: stat.size,
      });
    }
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
  const safe = sanitizeFilename(filename);
  const filePath = path.join(root, settings.folder, safe.endsWith(".md") ? safe : `${safe}.md`);
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
  const safe = sanitizeFilename(filename);
  const filePath = path.join(root, settings.folder, safe.endsWith(".md") ? safe : `${safe}.md`);
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
  const safe = sanitizeFilename(filename);
  const name = safe.endsWith(".md") ? safe : `${safe}.md`;
  const filePath = path.join(root, settings.folder, name);
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

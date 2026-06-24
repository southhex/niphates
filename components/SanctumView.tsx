// components/SanctumView.tsx
// Journal chamber: list entries, create new, edit with auto-save markdown editor.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  format,
  parse,
  isValid,
  startOfDay,
  eachDayOfInterval,
} from "date-fns";
import { MarkdownEditor } from "@/components/MarkdownEditor";

// Parse an entry's date from its filename against the settings' filename
// template. Returns null if the filename doesn't parse as a date in that
// format (e.g. an ad-hoc named note). Shared by deriveTitle and the sidebar
// ordering so both agree on what an entry's date is.
function parseEntryDate(filename: string, template: string): Date | null {
  const base = filename.replace(/\.md$/, "");
  if (!template) return null;
  try {
    const d = parse(base, template, new Date());
    return isValid(d) ? d : null;
  } catch {
    return null;
  }
}

// Human-readable entry title, derived from the filename by parsing it against
// the settings' filename template. If the filename doesn't parse as a date in
// that format, fall back to the bare filename (sans .md). The title is a
// Niphates-side display concern only — it is never written into the file.
function deriveTitle(filename: string, template: string): string {
  const d = parseEntryDate(filename, template);
  if (d) return format(d, "EEEE, dd MMMM yyyy");
  return filename.replace(/\.md$/, "");
}

interface JournalEntry {
  filename: string;
  displayName: string;
  folder: string;
  createdAt: number;
  updatedAt: number;
  size: number;
  wordCount: number;
}

interface SanctumSettings {
  connectorId: string;
  folder: string;
  filenameTemplate: string;
  wordGoal: number;
}

interface ConnectorOption {
  id: string;
  label: string;
}

const API = "/api/sanctum";
const ENTRIES_API = "/api/sanctum/entries";
const FOLDERS_API = "/api/sanctum/folders";

const DEBOUNCE_MS = 800;

// Count words in the entry body, ignoring YAML frontmatter and markdown
// punctuation so the goal tracks prose, not syntax.
function countWords(text: string): number {
  if (!text) return 0;
  const body = text.replace(/^---\n[\s\S]*?\n---\n?/, "");
  const matches = body
    .replace(/[#>*_`~\-\[\]()]/g, " ")
    .match(/\b[\p{L}\p{N}'’-]+\b/gu);
  return matches ? matches.length : 0;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Thin progress bar pinned flush to the bottom edge of the editor pane. The
// editor itself reserves bottom space (see EDITOR_FOOTER_PAD) so actively
// edited lines never slip under it.
function WordGoalBar({ words, goal }: { words: number; goal: number }) {
  const pct = Math.min(100, Math.round((words / goal) * 100));
  const reached = words >= goal;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-panel">
      <div
        className={`h-full transition-[width] duration-300 ease-out ${
          reached ? "bg-gold" : "bg-goldbri"
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// Completion ratio 0..1 for an entry against the goal. No goal → 0.
function completion(wordCount: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.min(1, wordCount / goal);
}

// Contribution heatmap above the file list: ONE CELL PER CALENDAR DAY from the
// earliest dated entry through today. Days with an entry are tinted by how
// close that entry got to the word goal; days with no entry render empty.
// Only entries whose filename parses as a date (via the template) participate —
// undated/ad-hoc notes have no day to place, so they're excluded. Hidden when
// there's no goal or no dated entries.
function Heatmap({
  entries,
  goal,
  template,
}: {
  entries: JournalEntry[];
  goal: number;
  template: string;
}) {
  if (goal <= 0) return null;

  // Map each dated entry onto its calendar day (yyyy-MM-dd key).
  const byDay = new Map<string, JournalEntry>();
  for (const e of entries) {
    const d = parseEntryDate(e.filename, template);
    if (!d) continue;
    byDay.set(format(startOfDay(d), "yyyy-MM-dd"), e);
  }
  if (byDay.size === 0) return null;

  // Day range: earliest entry day → today, inclusive.
  const keys = [...byDay.keys()].sort();
  const firstDay = parse(keys[0], "yyyy-MM-dd", new Date());
  const days = eachDayOfInterval({ start: firstDay, end: new Date() });

  return (
    <div className="border-b border-hair px-3 py-2.5">
      <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-mutedlo">
        Goal streak
      </div>
      <div className="flex flex-wrap gap-[3px]">
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const e = byDay.get(key);
          const c = e ? completion(e.wordCount, goal) : 0;
          const met = !!e && e.wordCount >= goal;
          const label = format(day, "EEE, dd MMM yyyy");
          return (
            <div
              key={key}
              title={
                e
                  ? `${label} · ${e.wordCount}/${goal} words`
                  : `${label} · no entry`
              }
              className={`h-3 w-3 border ${
                met ? "border-gold" : "border-hairlit"
              }`}
              style={{
                backgroundColor:
                  c > 0
                    ? `color-mix(in srgb, var(--gold) ${Math.round(
                        15 + c * 85,
                      )}%, transparent)`
                    : "var(--panel)",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

// Subtle word count, bottom-left, in the title font. Always shown.
function WordCount({ words, goal }: { words: number; goal: number }) {
  return (
    <div className="pointer-events-none absolute bottom-2 left-3 font-display text-[11px] tracking-[0.02em] text-mutedlo">
      {goal > 0 ? `${words} / ${goal} words` : `${words} words`}
    </div>
  );
}

export function SanctumView() {
  const [settings, setSettings] = useState<SanctumSettings | null>(null);
  const [connectors, setConnectors] = useState<ConnectorOption[]>([]);
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Editor state
  const [activeEntry, setActiveEntry] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Settings editing
  const [editingSettings, setEditingSettings] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<SanctumSettings | null>(null);

  const unconfigured = !settings?.connectorId;

  // --- Load settings + entries on mount -------------------------------

  const loadEntries = useCallback(async (s: SanctumSettings) => {
    if (!s.connectorId) {
      setEntries([]);
      return;
    }
    try {
      const res = await fetch(ENTRIES_API);
      const data = (await res.json()) as {
        entries?: JournalEntry[];
        unconfigured?: boolean;
      };
      if (data.unconfigured) {
        setEntries([]);
      } else {
        setEntries(data.entries ?? []);
      }
    } catch {
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      fetch(API).then((r) => r.json()),
      fetch("/api/connectors").then((r) => r.json()),
    ])
      .then(
        ([sanctumData, connectorsData]: [
          { settings: SanctumSettings },
          { connectors: ConnectorOption[] },
        ]) => {
          if (cancelled) return;
          setSettings(sanctumData.settings);
          setSettingsDraft(sanctumData.settings);
          setConnectors(connectorsData.connectors ?? []);
          loadEntries(sanctumData.settings).finally(() => {
            if (!cancelled) setLoading(false);
          });
        },
      )
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadEntries]);

  // --- Load folders when connector changes in draft ---------------------

  useEffect(() => {
    if (!settingsDraft?.connectorId) {
      setFolders([]);
      return;
    }
    fetch(`${FOLDERS_API}?connectorId=${encodeURIComponent(settingsDraft.connectorId)}`)
      .then((r) => r.json())
      .then((data: { folders: string[] }) => setFolders(data.folders ?? []))
      .catch(() => setFolders([]));
  }, [settingsDraft?.connectorId]);

  // --- Auto-save --------------------------------------------------------

  const doSave = useCallback(
    async (filename: string, text: string) => {
      setSaving(true);
      try {
        const res = await fetch(
          `${ENTRIES_API}/${encodeURIComponent(filename)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: text }),
          },
        );
        if (res.ok) {
          setSavedAt(Date.now());
        }
      } catch {
        // silent — will retry on next change
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  // Auto-save on content change with debounce
  useEffect(() => {
    if (!activeEntry || unconfigured) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      doSave(activeEntry, content);
    }, DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [content, activeEntry, unconfigured, doSave]);

  // --- Entry selection / creation -------------------------------------

  const selectEntry = async (entry: JournalEntry) => {
    // Save current before switching
    if (activeEntry && content) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      await doSave(activeEntry, content);
    }
    setActiveEntry(null);
    setContent("");
    try {
      const res = await fetch(
        `${ENTRIES_API}/${encodeURIComponent(entry.filename)}`,
      );
      const data = (await res.json()) as { content?: string; error?: string };
      if (!res.ok) {
        setError(data.error || `Failed to load entry (HTTP ${res.status})`);
        return;
      }
      setActiveEntry(entry.filename);
      setContent(data.content ?? "");
    } catch {
      setError("Failed to load entry");
    }
  };

  const newEntry = async () => {
    if (creating || !settings?.connectorId) return;
    setCreating(true);
    setError("");
    try {
      // No body → server seeds today's note with a date-title heading and
      // returns its filename whether it was just created or already existed.
      const res = await fetch(ENTRIES_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as { filename?: string; error?: string };
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`);
        return;
      }
      await loadEntries(settings);
      if (data.filename) {
        const entryRes = await fetch(
          `${ENTRIES_API}/${encodeURIComponent(data.filename)}`,
        );
        const entryData = (await entryRes.json()) as { content?: string };
        setActiveEntry(data.filename);
        setContent(entryData.content ?? "");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  // --- Settings save ----------------------------------------------------

  const saveSettings = async () => {
    if (!settingsDraft) return;
    try {
      const res = await fetch(API, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsDraft),
      });
      const data = (await res.json()) as { settings: SanctumSettings };
      setSettings(data.settings);
      setEditingSettings(false);
    } catch {
      setError("Failed to save settings");
    }
  };

  // --- Render -----------------------------------------------------------

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center font-mono text-[12px] text-mutedlo">
        Loading sanctum…
      </div>
    );
  }

  if (unconfigured || editingSettings) {
    const draft = settingsDraft ?? {
      connectorId: "",
      folder: "Journal",
      filenameTemplate: "yyyy-MM-dd",
      wordGoal: 0,
    };
    return (
      <div className="mx-auto max-w-2xl space-y-5 px-4 py-8">
        <h1 className="font-display text-[28px] font-semibold uppercase tracking-[0.06em] text-marble">
          Sanctum Setup
        </h1>
        {error && (
          <div className="border border-hair bg-panel px-3 py-2 font-mono text-[13px] text-carnelian">
            {error}
          </div>
        )}

        <div className="border border-hair bg-paneldk p-4 space-y-4">
          <div>
            <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
              ⌁ OBSIDIAN CONNECTOR
            </div>
            <p className="mb-3 font-mono text-[11px] text-mutedlo">
              Select the Obsidian vault connector to use for journal entries.
            </p>
            <select
              value={draft.connectorId}
              onChange={(e) =>
                setSettingsDraft({ ...draft, connectorId: e.target.value })
              }
              className="w-full border border-hair bg-panel px-3 py-2 font-mono text-[12px] text-marble outline-none focus:border-gold"
            >
              <option value="">— select connector —</option>
              {connectors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label || c.id}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
              ⌁ JOURNAL FOLDER
            </div>
            <p className="mb-3 font-mono text-[11px] text-mutedlo">
              Folder inside the vault where journal files live.
            </p>
            {folders.length > 0 ? (
              <select
                value={draft.folder}
                onChange={(e) =>
                  setSettingsDraft({ ...draft, folder: e.target.value })
                }
                className="w-full border border-hair bg-panel px-3 py-2 font-mono text-[12px] text-marble outline-none focus:border-gold"
              >
                {folders.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={draft.folder}
                onChange={(e) =>
                  setSettingsDraft({ ...draft, folder: e.target.value })
                }
                placeholder="Journal"
                className="w-full border border-hair bg-panel px-3 py-2 font-mono text-[12px] text-marble outline-none focus:border-gold"
              />
            )}
          </div>

          <div>
            <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
              ⌁ FILENAME TEMPLATE
            </div>
            <p className="mb-3 font-mono text-[11px] text-mutedlo">
              Date format for new entry filenames (e.g.{" "}
              <code className="text-gold">yyyy-MM-dd</code>). Invalid
              formats fall back to ISO date.
            </p>
            <input
              value={draft.filenameTemplate}
              onChange={(e) =>
                setSettingsDraft({
                  ...draft,
                  filenameTemplate: e.target.value,
                })
              }
              placeholder="yyyy-MM-dd"
              className="w-full border border-hair bg-panel px-3 py-2 font-mono text-[12px] text-marble outline-none focus:border-gold"
            />
          </div>

          <div>
            <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
              ⌁ WORD COUNT GOAL
            </div>
            <p className="mb-3 font-mono text-[11px] text-mutedlo">
              Target word count per entry. A progress bar floats over the editor
              as you write. Set to <code className="text-gold">0</code> to hide
              it.
            </p>
            <input
              type="number"
              min={0}
              step={50}
              value={draft.wordGoal}
              onChange={(e) =>
                setSettingsDraft({
                  ...draft,
                  wordGoal: Math.max(0, Math.round(Number(e.target.value) || 0)),
                })
              }
              placeholder="0"
              className="w-full border border-hair bg-panel px-3 py-2 font-mono text-[12px] text-marble outline-none focus:border-gold"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={saveSettings}
              className="border border-hair bg-panel px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-marble transition hover:border-gold hover:text-gold"
            >
              SAVE
            </button>
            {settings?.connectorId && (
              <button
                onClick={() => {
                  setSettingsDraft(settings);
                  setEditingSettings(false);
                }}
                className="border border-hair bg-panel px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted transition hover:border-lapis hover:text-lapis"
              >
                CANCEL
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Configured — show main sanctum view.
  // Order the sidebar by the date parsed from each filename (newest first).
  // Entries whose names don't parse as a date sort after the dated ones,
  // ordered by mtime as a stable fallback.
  const template = settings?.filenameTemplate ?? "";
  const sortedEntries = entries
    ? [...entries].sort((a, b) => {
        const da = parseEntryDate(a.filename, template);
        const db = parseEntryDate(b.filename, template);
        if (da && db) return db.getTime() - da.getTime();
        if (da) return -1;
        if (db) return 1;
        return b.updatedAt - a.updatedAt;
      })
    : entries;

  const goal = settings?.wordGoal ?? 0;

  return (
    <div className="mx-auto flex h-full max-w-[1200px] flex-col px-3 py-4 md:px-4 md:py-6">
      <div className="mb-3 flex items-center justify-between md:mb-4">
        <h1 className="font-display text-[22px] font-semibold uppercase tracking-[0.06em] text-marble md:text-[28px]">
          Sanctum
        </h1>
        <button
          onClick={() => {
            setSettingsDraft(settings);
            setEditingSettings(true);
          }}
          className="border border-hair px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-muted transition hover:border-lapis hover:text-lapis"
        >
          SETTINGS
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
        {/* Entry list sidebar — full width on mobile, hidden once an entry is
            open (single-pane list/detail); fixed column on md+. */}
        <div
          className={`${
            activeEntry ? "hidden md:flex" : "flex"
          } min-h-0 w-full shrink-0 flex-col border border-hair bg-paneldk md:w-60`}
        >
          <div className="flex items-center justify-between border-b border-hair px-3 py-2">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-muted">
              Entries
            </span>
            <button
              onClick={newEntry}
              disabled={creating}
              className="border border-hair px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-gold transition hover:border-gold disabled:opacity-40"
            >
              {creating ? "…" : "+ NEW"}
            </button>
          </div>
          {sortedEntries && sortedEntries.length > 0 && (
            <Heatmap
              entries={sortedEntries}
              goal={goal}
              template={settings?.filenameTemplate ?? ""}
            />
          )}
          {sortedEntries && sortedEntries.length > 0 ? (
            <nav className="flex-1 overflow-y-auto overscroll-contain">
              {sortedEntries.map((e) => {
                const isActive = e.filename === activeEntry;
                const met = goal > 0 && e.wordCount >= goal;
                return (
                  <button
                    key={e.filename}
                    onClick={() => selectEntry(e)}
                    style={
                      met && !isActive
                        ? {
                            backgroundColor:
                              "color-mix(in srgb, var(--gold) 8%, transparent)",
                          }
                        : undefined
                    }
                    className={`block w-full border-b border-hairlit px-3 py-2.5 text-left transition-colors ${
                      isActive
                        ? "bg-panel text-marble"
                        : met
                          ? "text-parch hover:text-marble"
                          : "text-muted hover:bg-panel hover:text-parch"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-display text-[13px] tracking-[0.01em]">
                        {deriveTitle(
                          e.filename,
                          settings?.filenameTemplate ?? "",
                        )}
                      </span>
                      {met && (
                        <span
                          className="ml-auto shrink-0 text-[10px] text-gold"
                          title="Word goal met"
                        >
                          ✦
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 font-mono text-[9.5px] text-mutedlo">
                      {formatTime(e.updatedAt)}
                      {goal > 0 && ` · ${e.wordCount}w`}
                    </div>
                  </button>
                );
              })}
            </nav>
          ) : (
            <div className="px-3 py-4 font-mono text-[11px] text-mutedlo">
              No entries yet. Click{" "}
              <strong className="text-gold">+ NEW</strong> to create today&apos;s entry.
            </div>
          )}
        </div>

        {/* Editor pane — full width on mobile, only shown when an entry is
            active; flexes beside the list on md+. */}
        {activeEntry ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col border border-hair bg-paneldk">
            {/* Editor header — filename + save state */}
            <div className="flex items-center justify-between gap-2 border-b border-hair px-3 py-2 md:px-4">
              <button
                onClick={() => {
                  if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
                  if (activeEntry && content) doSave(activeEntry, content);
                  setActiveEntry(null);
                  setContent("");
                }}
                className="shrink-0 font-mono text-[14px] text-muted hover:text-gold md:hidden"
                title="Back to entries"
              >
                ‹
              </button>
              <span className="truncate font-mono text-[12px] text-marble">
                {activeEntry.replace(/\.md$/, "")}
              </span>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-muted">
                {saving
                  ? "Saving…"
                  : savedAt
                    ? `Saved ${new Date(savedAt).toLocaleTimeString()}`
                    : ""}
              </span>
            </div>

            {/* Editor */}
            <div className="relative flex-1 overflow-hidden">
              <MarkdownEditor
                value={content}
                onChange={setContent}
                placeholder="Write your entry…"
                title={deriveTitle(
                  activeEntry,
                  settings?.filenameTemplate ?? "",
                )}
              />
              <WordCount
                words={countWords(content)}
                goal={settings?.wordGoal ?? 0}
              />
              {(settings?.wordGoal ?? 0) > 0 && (
                <WordGoalBar
                  words={countWords(content)}
                  goal={settings!.wordGoal}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="hidden flex-1 items-center justify-center md:flex">
            <div className="text-center">
              <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.24em] text-mutedlo">
                ❯ no entry selected
              </div>
              <button
                onClick={newEntry}
                disabled={creating}
                className="border border-hair bg-panel px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-marble transition hover:border-gold hover:text-gold disabled:opacity-40"
              >
                {creating ? "CREATING…" : "NEW ENTRY"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

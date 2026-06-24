// components/SanctumView.tsx
// Journal chamber: list entries, create new, edit with auto-save markdown editor.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MarkdownEditor } from "@/components/MarkdownEditor";

interface JournalEntry {
  filename: string;
  displayName: string;
  folder: string;
  createdAt: number;
  updatedAt: number;
  size: number;
}

interface SanctumSettings {
  connectorId: string;
  folder: string;
  filenameTemplate: string;
}

interface ConnectorOption {
  id: string;
  label: string;
}

const API = "/api/sanctum";
const ENTRIES_API = "/api/sanctum/entries";
const FOLDERS_API = "/api/sanctum/folders";

const DEBOUNCE_MS = 800;

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
      const data = (await res.json()) as { content: string };
      setActiveEntry(entry.filename);
      setContent(data.content);
    } catch {
      setError("Failed to load entry");
    }
  };

  const newEntry = async () => {
    if (creating || !settings?.connectorId) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch(ENTRIES_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "" }),
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
        const entryData = (await entryRes.json()) as { content: string };
        setActiveEntry(data.filename);
        setContent(entryData.content);
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

  // Configured — show main sanctum view
  return (
    <div className="mx-auto flex h-full max-w-[1200px] flex-col px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-[28px] font-semibold uppercase tracking-[0.06em] text-marble">
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

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Entry list sidebar */}
        <div className="flex w-60 shrink-0 flex-col border border-hair bg-paneldk">
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
          {entries && entries.length > 0 ? (
            <nav className="flex-1 overflow-y-auto overscroll-contain">
              {entries.map((e) => {
                const isActive = e.filename === activeEntry;
                return (
                  <button
                    key={e.filename}
                    onClick={() => selectEntry(e)}
                    className={`block w-full border-b border-hairlit px-3 py-2.5 text-left transition-colors ${
                      isActive
                        ? "bg-panel text-marble"
                        : "text-muted hover:bg-panel hover:text-parch"
                    }`}
                  >
                    <div className="truncate font-mono text-[12px]">
                      {e.displayName}
                    </div>
                    <div className="mt-0.5 font-mono text-[9.5px] text-mutedlo">
                      {formatTime(e.updatedAt)}
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

        {/* Editor pane */}
        {activeEntry ? (
          <div className="flex min-w-0 flex-1 flex-col border border-hair bg-paneldk">
            {/* Editor header */}
            <div className="flex items-center justify-between border-b border-hair px-4 py-2">
              <span className="font-mono text-[12px] text-marble">
                {activeEntry.replace(/\.md$/, "")}
              </span>
              <span className="font-mono text-[10px] text-muted">
                {saving
                  ? "Saving…"
                  : savedAt
                    ? `Saved ${new Date(savedAt).toLocaleTimeString()}`
                    : ""}
              </span>
            </div>

            {/* Editor */}
            <div className="flex-1 overflow-hidden">
              <MarkdownEditor
                value={content}
                onChange={setContent}
                placeholder="Write your entry…"
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
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

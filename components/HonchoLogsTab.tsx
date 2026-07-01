// components/HonchoLogsTab.tsx
// Live ingestion log — queue status + most recent messages across sessions.
//
// Auto-refresh toggle polls every 5s when enabled. Manual REFRESH button
// always works. The "ingestions" panel shows the latest messages from the
// most-recent N sessions, which is effectively "what Honcho just learned
// about."

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  honchoApi,
  type HonchoMessage,
  type HonchoQueueStatus,
  type HonchoSession,
} from "@/lib/honchoClient";
import { honchoAgo, honchoFmtTime } from "@/components/HonchoDashboard";

function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${
        active ? "bg-emerald-400" : "bg-mutedlo"
      }`}
    />
  );
}

// How many recent sessions to scan for messages.
const SCAN_SESSION_COUNT = 5;
// How many messages to pull from each scanned session.
const MESSAGES_PER_SESSION = 4;
// Auto-refresh interval in ms.
const POLL_INTERVAL_MS = 5000;

export function HonchoLogsTab({ workspace }: { workspace: string }) {
  const [queue, setQueue] = useState<HonchoQueueStatus | null>(null);
  const [queueError, setQueueError] = useState("");
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueUpdatedAt, setQueueUpdatedAt] = useState<number | null>(null);

  const [messages, setMessages] = useState<IngestionEntry[]>([]);
  const [messagesError, setMessagesError] = useState("");
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesUpdatedAt, setMessagesUpdatedAt] = useState<number | null>(null);

  const [autoRefresh, setAutoRefresh] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Loaders ──────────────────────────────────────────────────────────
  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    setQueueError("");
    const r = await honchoApi.queueStatus(workspace);
    if (r.ok && r.data) {
      setQueue(r.data);
    } else {
      setQueueError(r.error || "Failed to load queue");
    }
    setQueueLoading(false);
    setQueueUpdatedAt(Date.now());
  }, [workspace]);

  const loadIngestions = useCallback(async () => {
    setMessagesLoading(true);
    setMessagesError("");
    // 1) Get the most recent sessions.
    const sessR = await honchoApi.listSessions(workspace, 1, SCAN_SESSION_COUNT);
    if (!sessR.ok || !sessR.data) {
      setMessagesError(sessR.error || "Failed to load sessions for ingestion log");
      setMessages([]);
      setMessagesLoading(false);
      setMessagesUpdatedAt(Date.now());
      return;
    }
    // 2) Pull recent messages from each, then merge + sort.
    const perSession = await Promise.all(
      sessR.data.items.map(async (s) => {
        const r = await honchoApi.getSessionMessages(workspace, s.id, MESSAGES_PER_SESSION);
        if (!r.ok || !r.data) return [];
        return r.data.items.map((m) => ({ message: m, session: s }));
      }),
    );
    const merged = perSession
      .flat()
      .sort((a, b) => +new Date(b.message.created_at) - +new Date(a.message.created_at))
      .slice(0, SCAN_SESSION_COUNT * MESSAGES_PER_SESSION);
    setMessages(merged);
    setMessagesLoading(false);
    setMessagesUpdatedAt(Date.now());
  }, [workspace]);

  // ── Auto-refresh lifecycle ───────────────────────────────────────────
  // Re-arm the interval whenever autoRefresh or workspace flips. Cleanup on
  // unmount or when toggled off.
  useEffect(() => {
    if (!autoRefresh) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    // Fire immediately so the user doesn't stare at stale data.
    void loadQueue();
    void loadIngestions();
    pollRef.current = setInterval(() => {
      void loadQueue();
      void loadIngestions();
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [autoRefresh, loadQueue, loadIngestions]);

  // One-shot load on workspace change.
  useEffect(() => {
    if (!workspace) return;
    void loadQueue();
    void loadIngestions();
  }, [workspace, loadQueue, loadIngestions]);

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header bar with auto-refresh + manual refresh */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
            ⌁ LIVE LOG
          </span>
          {autoRefresh && (
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-emerald-400">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              POLLING · {POLL_INTERVAL_MS / 1000}s
            </span>
          )}
          {queueUpdatedAt && (
            <span className="font-mono text-[10px] text-mutedlo">
              Last refresh: {honchoFmtTime(new Date(queueUpdatedAt).toISOString())}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 font-mono text-[11px] text-mutedlo hover:text-parch">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="h-3 w-3 accent-gold"
            />
            AUTO-REFRESH
          </label>
          <button
            onClick={() => {
              void loadQueue();
              void loadIngestions();
            }}
            disabled={messagesLoading || queueLoading}
            className="border border-hair px-3 py-1 font-mono text-[10px] text-mutedlo hover:text-parch disabled:opacity-40"
          >
            {messagesLoading || queueLoading ? "…" : "REFRESH"}
          </button>
        </div>
      </div>

      {/* Queue status — dream / representation / summary work units */}
      <QueuePanel
        queue={queue}
        loading={queueLoading}
        error={queueError}
        onReload={loadQueue}
      />

      {/* Recent ingestions — the actual "what just got written" feed */}
      <IngestionsPanel
        entries={messages}
        loading={messagesLoading}
        error={messagesError}
        onReload={loadIngestions}
        updatedAt={messagesUpdatedAt}
      />
    </div>
  );
}

// ─── Sub-panels ─────────────────────────────────────────────────────────

interface IngestionEntry {
  message: HonchoMessage;
  session: HonchoSession;
}

function QueuePanel({
  queue,
  loading,
  error,
  onReload,
}: {
  queue: HonchoQueueStatus | null;
  loading: boolean;
  error: string;
  onReload: () => void;
}) {
  return (
    <section className="border border-hair bg-paneldk">
      <div className="flex items-center justify-between border-b border-hair px-4 py-2">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
          ⌁ QUEUE / DREAM PIPELINE
        </span>
        <button
          onClick={onReload}
          disabled={loading}
          className="border border-hair px-2 py-1 font-mono text-[10px] text-mutedlo hover:text-parch disabled:opacity-40"
        >
          {loading ? "…" : "REFRESH"}
        </button>
      </div>

      {error ? (
        <div className="p-4 font-mono text-[12px] text-carnelian">{error}</div>
      ) : !queue ? (
        <div className="p-4 font-mono text-[12px] text-mutedlo">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
            <QueueStat
              label="Total work units"
              value={queue.total_work_units}
              tone="neutral"
            />
            <QueueStat
              label="Completed"
              value={queue.completed_work_units}
              tone="done"
            />
            <QueueStat
              label="In progress"
              value={queue.in_progress_work_units}
              tone="busy"
            />
            <QueueStat
              label="Pending"
              value={queue.pending_work_units}
              tone={queue.pending_work_units > 0 ? "warn" : "neutral"}
            />
          </div>
          {queue.sessions && Object.keys(queue.sessions).length > 0 && (
            <div className="border-t border-hair">
              <div className="px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-mutedlo">
                Per session
              </div>
              <ul className="divide-y divide-hair">
                {Object.values(queue.sessions)
                  .sort((a, b) => b.pending_work_units - a.pending_work_units)
                  .map((s) => (
                    <li
                      key={s.session_id}
                      className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-panel"
                    >
                      <StatusDot active={s.in_progress_work_units > 0} />
                      <div className="min-w-0 flex-1">
                        <div
                          className="truncate font-mono text-[12px] text-marble"
                          title={s.session_id}
                        >
                          {s.session_id.length > 40
                            ? s.session_id.slice(0, 40) + "…"
                            : s.session_id}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-3 font-mono text-[10px] text-mutedlo">
                        <span>
                          <span className="text-mutedlo">done</span>{" "}
                          <span className="text-emerald-400">
                            {s.completed_work_units}
                          </span>
                        </span>
                        <span>
                          <span className="text-mutedlo">busy</span>{" "}
                          <span className="text-gold">
                            {s.in_progress_work_units}
                          </span>
                        </span>
                        <span>
                          <span className="text-mutedlo">pending</span>{" "}
                          <span
                            className={
                              s.pending_work_units > 0
                                ? "text-carnelian"
                                : "text-mutedlo"
                            }
                          >
                            {s.pending_work_units}
                          </span>
                        </span>
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function QueueStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "done" | "busy" | "warn";
}) {
  const valueClass =
    tone === "done"
      ? "text-emerald-400"
      : tone === "busy"
        ? "text-gold"
        : tone === "warn"
          ? "text-carnelian"
          : "text-marble";
  return (
    <div className="border border-hair bg-panel px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-mutedlo">
        {label}
      </div>
      <div className={`mt-1 font-display text-[20px] font-semibold ${valueClass}`}>
        {value}
      </div>
    </div>
  );
}

function IngestionsPanel({
  entries,
  loading,
  error,
  onReload,
  updatedAt,
}: {
  entries: IngestionEntry[];
  loading: boolean;
  error: string;
  onReload: () => void;
  updatedAt: number | null;
}) {
  return (
    <section className="border border-hair bg-paneldk">
      <div className="flex items-center justify-between border-b border-hair px-4 py-2">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
          ⌁ RECENT INGESTIONS · {entries.length}
        </span>
        <div className="flex items-center gap-2">
          {updatedAt && (
            <span className="font-mono text-[10px] text-mutedlo">
              {honchoFmtTime(new Date(updatedAt).toISOString())}
            </span>
          )}
          <button
            onClick={onReload}
            disabled={loading}
            className="border border-hair px-2 py-1 font-mono text-[10px] text-mutedlo hover:text-parch disabled:opacity-40"
          >
            {loading ? "…" : "REFRESH"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="p-4 font-mono text-[12px] text-carnelian">{error}</div>
      ) : loading && entries.length === 0 ? (
        <div className="p-6 text-center font-mono text-[12px] text-mutedlo">
          Loading recent messages…
        </div>
      ) : entries.length === 0 ? (
        <div className="p-6 text-center font-mono text-[12px] text-mutedlo">
          No recent messages
        </div>
      ) : (
        <ul className="divide-y divide-hair">
          {entries.map((e) => (
            <MessageRow key={e.message.id} entry={e} />
          ))}
        </ul>
      )}
    </section>
  );
}

function MessageRow({ entry }: { entry: IngestionEntry }) {
  const { message: m, session: s } = entry;
  const sessionLabel = s.id.length > 25 ? s.id.slice(0, 25) + "…" : s.id;
  return (
    <li className="px-4 py-3 transition-colors hover:bg-panel">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] text-mutedlo">
          {honchoFmtTime(m.created_at)}
        </span>
        <span className="font-mono text-[10px] text-mutedlo">·</span>
        <span className="font-mono text-[10px] text-mutedlo">
          {honchoAgo(m.created_at)}
        </span>
        <span className="rounded border border-hair bg-panel px-1.5 py-0.5 font-mono text-[10px] text-gold">
          {m.peer_id}
        </span>
        <span className="font-mono text-[10px] text-mutedlo">in</span>
        <span
          className="truncate font-mono text-[10px] text-mutedlo"
          title={s.id}
        >
          {sessionLabel}
        </span>
        {m.token_count !== undefined && (
          <span className="ml-auto font-mono text-[10px] text-mutedlo">
            {m.token_count} tok
          </span>
        )}
      </div>
      <div className="font-mono text-[12px] leading-relaxed text-parch">
        {m.content.length > 300 ? m.content.slice(0, 300) + "…" : m.content}
      </div>
    </li>
  );
}

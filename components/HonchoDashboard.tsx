// components/HonchoDashboard.tsx
// Honcho memory dashboard — tabbed layout with Overview, Peers, Sessions, Logs,
// and Dreams panels.

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  honchoApi,
  DEFAULT_WORKSPACE,
  type HonchoConfig,
  type HonchoPeer,
  type HonchoSession,
  type HonchoPeerContext,
} from "@/lib/honchoClient";
import { HonchoLogsTab } from "@/components/HonchoLogsTab";

// ─── Helpers ────────────────────────────────────────────────────────────

function ago(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function fmtDate(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtTime(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ─── Shared building blocks ─────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-hair bg-panel px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-mutedlo">
        {label}
      </div>
      <div className="mt-1 font-mono text-[13px] text-marble">{String(value)}</div>
    </div>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${
        active ? "bg-emerald-400" : "bg-mutedlo"
      }`}
    />
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="p-6 text-center font-mono text-[12px] text-mutedlo">
      {message}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="p-6 text-center font-mono text-[12px] text-carnelian">
      {message}
    </div>
  );
}

// ─── Tabs ───────────────────────────────────────────────────────────────

type Tab = "overview" | "peers" | "sessions" | "logs" | "dreams";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "peers", label: "Peers" },
  { id: "sessions", label: "Sessions" },
  { id: "logs", label: "Logs" },
  { id: "dreams", label: "Dreams" },
];

function TabBar({
  active,
  onChange,
  counts,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  counts: Partial<Record<Tab, number>>;
}) {
  return (
    <nav className="flex flex-wrap gap-1 border-b border-hair">
      {TABS.map((t) => {
        const isActive = active === t.id;
        const count = counts[t.id];
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors ${
              isActive
                ? "border-gold text-gold"
                : "border-transparent text-mutedlo hover:text-parch"
            }`}
          >
            {t.label}
            {count !== undefined && count > 0 ? (
              <span
                className={`ml-2 ${
                  isActive ? "text-gold" : "text-mutedlo"
                } text-[10px]`}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

// ─── Dashboard root ─────────────────────────────────────────────────────

export function HonchoDashboard() {
  const [config, setConfig] = useState<HonchoConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState("");

  const [peers, setPeers] = useState<HonchoPeer[]>([]);
  const [peersLoading, setPeersLoading] = useState(false);
  const [peersError, setPeersError] = useState("");

  const [sessions, setSessions] = useState<HonchoSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState("");

  const [expandedPeer, setExpandedPeer] = useState<string | null>(null);
  const [peerContexts, setPeerContexts] = useState<
    Record<string, HonchoPeerContext>
  >({});
  const [contextLoading, setContextLoading] = useState<string | null>(null);

  const [dreamScheduling, setDreamScheduling] = useState(false);
  const [dreamMsg, setDreamMsg] = useState("");

  const [tab, setTab] = useState<Tab>("overview");

  const workspace = config?.workspace || DEFAULT_WORKSPACE;

  // ── Config ───────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setConfigLoading(true);
    honchoApi
      .config()
      .then((r) => {
        if (cancelled) return;
        if (r.ok && r.data) {
          setConfig(r.data.config);
        } else {
          setConfigError(r.error || "Failed to load Honcho config");
        }
      })
      .catch((err) => {
        if (!cancelled) setConfigError(String(err));
      })
      .finally(() => {
        if (!cancelled) setConfigLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Loaders (stable for the workspace lifetime) ──────────────────────
  const loadPeers = useCallback(async (ws: string) => {
    setPeersLoading(true);
    setPeersError("");
    const r = await honchoApi.listPeers(ws);
    if (r.ok && r.data) {
      setPeers(r.data.items);
    } else {
      setPeersError(r.error || "Failed to load peers");
      setPeers([]);
    }
    setPeersLoading(false);
  }, []);

  const loadSessions = useCallback(async (ws: string) => {
    setSessionsLoading(true);
    setSessionsError("");
    const r = await honchoApi.listSessions(ws);
    if (r.ok && r.data) {
      setSessions(r.data.items);
    } else {
      setSessionsError(r.error || "Failed to load sessions");
      setSessions([]);
    }
    setSessionsLoading(false);
  }, []);

  // ── Reload everything that depends on the workspace ──────────────────
  useEffect(() => {
    if (!workspace) return;
    setPeerContexts({});
    setExpandedPeer(null);
    void loadPeers(workspace);
    void loadSessions(workspace);
  }, [workspace, loadPeers, loadSessions]);

  // ── Expand a peer: load context on demand, cache it ──────────────────
  const togglePeer = useCallback(
    async (peerId: string) => {
      if (expandedPeer === peerId) {
        setExpandedPeer(null);
        return;
      }
      setExpandedPeer(peerId);
      if (peerContexts[peerId]) return;

      setContextLoading(peerId);
      const r = await honchoApi.getPeerContext(workspace, peerId);
      setContextLoading(null);
      if (r.ok && r.data) {
        setPeerContexts((prev) => ({ ...prev, [peerId]: r.data! }));
      }
    },
    [expandedPeer, peerContexts, workspace],
  );

  // ── Schedule a dream ─────────────────────────────────────────────────
  const onScheduleDream = async () => {
    setDreamScheduling(true);
    setDreamMsg("");
    const observer = config?.aiPeer || "hermes";
    const r = await honchoApi.scheduleDream(workspace, observer);
    setDreamScheduling(false);
    setDreamMsg(
      r.ok
        ? "✅ Dream scheduled successfully"
        : `❌ ${r.error || "Failed to schedule dream"}`,
    );
  };

  const tabCounts: Partial<Record<Tab, number>> = {
    peers: peers.length || undefined,
    sessions: sessions.length || undefined,
  };

  return (
    <div className="space-y-4">
      <TabBar active={tab} onChange={setTab} counts={tabCounts} />

      <div className="pt-2">
        {tab === "overview" && (
          <OverviewTab
            config={config}
            configLoading={configLoading}
            configError={configError}
            peers={peers}
            sessions={sessions}
          />
        )}
        {tab === "peers" && (
          <PeersTab
            peers={peers}
            peersLoading={peersLoading}
            peersError={peersError}
            onReload={() => loadPeers(workspace)}
            expandedPeer={expandedPeer}
            peerContexts={peerContexts}
            contextLoading={contextLoading}
            onTogglePeer={togglePeer}
          />
        )}
        {tab === "sessions" && (
          <SessionsTab
            sessions={sessions}
            sessionsLoading={sessionsLoading}
            sessionsError={sessionsError}
            onReload={() => loadSessions(workspace)}
          />
        )}
        {tab === "logs" && <HonchoLogsTab workspace={workspace} />}
        {tab === "dreams" && (
          <DreamsTab
            config={config}
            scheduling={dreamScheduling}
            message={dreamMsg}
            onSchedule={onScheduleDream}
          />
        )}
      </div>
    </div>
  );
}

// ─── Tab implementations ────────────────────────────────────────────────

function OverviewTab({
  config,
  configLoading,
  configError,
  peers,
  sessions,
}: {
  config: HonchoConfig | null;
  configLoading: boolean;
  configError: string;
  peers: HonchoPeer[];
  sessions: HonchoSession[];
}) {
  return (
    <div className="space-y-4">
      {configLoading ? (
        <div className="border border-hair bg-paneldk p-6 font-mono text-[12px] text-mutedlo">
          Loading Honcho config…
        </div>
      ) : configError ? (
        <div className="border border-hair bg-paneldk p-6 font-mono text-[12px] text-carnelian">
          ⚠ {configError}
        </div>
      ) : config ? (
        <section className="border border-hair bg-paneldk p-4">
          <div className="mb-3 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
            ⌁ HONCHO STATUS
            <StatusDot active={config.enabled} />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Base URL" value={config.baseUrl} />
            <Stat label="Workspace" value={config.workspace} />
            <Stat label="Status" value={config.enabled ? "Enabled" : "Disabled"} />
            <Stat label="Recall" value={config.recallMode} />
            <Stat label="Cadence" value={`Every ${config.dialecticCadence} turn(s)`} />
            <Stat label="Reasoning" value={config.dialecticReasoningLevel} />
            <Stat label="Strategy" value={config.sessionStrategy} />
            <Stat label="Write Freq" value={config.writeFrequency} />
            <Stat label="Observe" value={config.observationMode} />
            <Stat label="User Peer" value={config.peerName} />
            <Stat label="AI Peer" value={config.aiPeer} />
            <Stat label="Active hosts" value={config.hosts.length} />
          </div>
        </section>
      ) : null}

      {/* Quick-glance summary of peers + sessions so the overview tab
          is useful even before drilling into the dedicated tabs. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <section className="border border-hair bg-paneldk p-4">
          <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
            ⌁ PEERS · {peers.length}
          </div>
          {peers.length === 0 ? (
            <EmptyState message="No peers yet" />
          ) : (
            <ul className="space-y-1">
              {peers.slice(0, 5).map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-2 font-mono text-[12px]"
                >
                  <StatusDot active />
                  <span className="text-marble">{p.id}</span>
                  <span className="text-mutedlo">· {ago(p.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border border-hair bg-paneldk p-4">
          <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
            ⌁ SESSIONS · {sessions.length}
          </div>
          {sessions.length === 0 ? (
            <EmptyState message="No sessions yet" />
          ) : (
            <ul className="space-y-1">
              {sessions.slice(0, 5).map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-2 font-mono text-[12px]"
                >
                  <StatusDot active={s.is_active} />
                  <span className="truncate text-marble" title={s.id}>
                    {/^\d{8}_/.test(s.id) || s.id.startsWith("cron_")
                      ? s.id.length > 30
                        ? s.id.slice(0, 30) + "…"
                        : s.id
                      : s.id}
                  </span>
                  <span className="text-mutedlo">· {ago(s.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function PeersTab({
  peers,
  peersLoading,
  peersError,
  onReload,
  expandedPeer,
  peerContexts,
  contextLoading,
  onTogglePeer,
}: {
  peers: HonchoPeer[];
  peersLoading: boolean;
  peersError: string;
  onReload: () => void;
  expandedPeer: string | null;
  peerContexts: Record<string, HonchoPeerContext>;
  contextLoading: string | null;
  onTogglePeer: (id: string) => void;
}) {
  return (
    <section className="border border-hair bg-paneldk">
      <div className="flex items-center justify-between border-b border-hair px-4 py-2">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
          ⌁ PEERS · {peers.length}
        </span>
        <button
          onClick={onReload}
          disabled={peersLoading}
          className="border border-hair px-2 py-1 font-mono text-[10px] text-mutedlo hover:text-parch disabled:opacity-40"
        >
          {peersLoading ? "…" : "REFRESH"}
        </button>
      </div>

      {peersLoading && peers.length === 0 ? (
        <EmptyState message="Loading peers…" />
      ) : peersError && peers.length === 0 ? (
        <ErrorState message={peersError} />
      ) : peers.length === 0 ? (
        <EmptyState message="No peers found" />
      ) : (
        <ul className="divide-y divide-hair">
          {peers.map((peer) => (
            <PeerRow
              key={peer.id}
              peer={peer}
              isExpanded={expandedPeer === peer.id}
              context={peerContexts[peer.id]}
              isLoadingContext={contextLoading === peer.id}
              onToggle={onTogglePeer}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SessionsTab({
  sessions,
  sessionsLoading,
  sessionsError,
  onReload,
}: {
  sessions: HonchoSession[];
  sessionsLoading: boolean;
  sessionsError: string;
  onReload: () => void;
}) {
  return (
    <section className="border border-hair bg-paneldk">
      <div className="flex items-center justify-between border-b border-hair px-4 py-2">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
          ⌁ RECENT SESSIONS · {sessions.length}
        </span>
        <button
          onClick={onReload}
          disabled={sessionsLoading}
          className="border border-hair px-2 py-1 font-mono text-[10px] text-mutedlo hover:text-parch disabled:opacity-40"
        >
          {sessionsLoading ? "…" : "REFRESH"}
        </button>
      </div>

      {sessionsLoading && sessions.length === 0 ? (
        <EmptyState message="Loading sessions…" />
      ) : sessionsError && sessions.length === 0 ? (
        <ErrorState message={sessionsError} />
      ) : sessions.length === 0 ? (
        <EmptyState message="No sessions yet" />
      ) : (
        <>
          <ul className="divide-y divide-hair">
            {sessions.slice(0, 15).map((s) => (
              <SessionRow key={s.id} session={s} />
            ))}
          </ul>
          {sessions.length > 15 && (
            <div className="border-t border-hair px-4 py-2 text-center font-mono text-[11px] text-mutedlo">
              +{sessions.length - 15} more sessions
            </div>
          )}
        </>
      )}
    </section>
  );
}

function DreamsTab({
  config,
  scheduling,
  message,
  onSchedule,
}: {
  config: HonchoConfig | null;
  scheduling: boolean;
  message: string;
  onSchedule: () => void;
}) {
  return (
    <section className="border border-hair bg-paneldk p-4">
      <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
        ⌁ DREAMS
      </div>
      <p className="mb-3 font-mono text-[11px] text-mutedlo">
        Dreams are Honcho&apos;s background dialectic reasoning — they analyze
        conversations and derive observations about peers. Schedule an
        immediate dream to process recent messages.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={onSchedule}
          disabled={scheduling || !config}
          className="border border-hair px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-parch hover:border-lapis hover:text-lapis disabled:opacity-40"
        >
          {scheduling ? "SCHEDULING…" : "SCHEDULE DREAM"}
        </button>
        {message && (
          <span className="font-mono text-[11px] text-parch">{message}</span>
        )}
      </div>
    </section>
  );
}

// ─── Row subcomponents ──────────────────────────────────────────────────

function PeerRow({
  peer,
  isExpanded,
  context,
  isLoadingContext,
  onToggle,
}: {
  peer: HonchoPeer;
  isExpanded: boolean;
  context: HonchoPeerContext | undefined;
  isLoadingContext: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <li>
      <button
        onClick={() => onToggle(peer.id)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-panel"
      >
        <StatusDot active />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[13px] text-marble">{peer.id}</div>
          <div className="mt-0.5 font-mono text-[10.5px] text-mutedlo">
            Created {ago(peer.created_at)}
          </div>
        </div>
        <span className="font-mono text-[11px] text-mutedlo">
          {isExpanded ? "▲" : "▼"}
        </span>
      </button>

      {isExpanded && (
        <div className="border-t border-hair bg-panel px-4 py-3">
          {isLoadingContext ? (
            <div className="font-mono text-[11px] text-mutedlo">
              Loading context…
            </div>
          ) : context ? (
            <PeerContextView context={context} />
          ) : (
            <div className="font-mono text-[11px] italic text-mutedlo">
              No context data.
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function PeerContextView({ context }: { context: HonchoPeerContext }) {
  const hasCard = !!context.peer_card && context.peer_card.length > 0;
  const hasRep = !!context.representation;
  if (!hasCard && !hasRep) {
    return (
      <div className="font-mono text-[11px] italic text-mutedlo">
        No peer card or representation yet.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {hasCard && (
        <div>
          <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-mutedlo">
            Card
          </div>
          <ul className="space-y-1">
            {context.peer_card!.map((fact, i) => (
              <li key={i} className="font-mono text-[12px] text-parch">
                • {fact}
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasRep && (
        <div>
          <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-mutedlo">
            Representation
          </div>
          <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-parch">
            {context.representation.length > 600
              ? context.representation.slice(0, 600) + "…"
              : context.representation}
          </pre>
        </div>
      )}
    </div>
  );
}

function SessionRow({ session }: { session: HonchoSession }) {
  const id = session.id;
  const isLong = id.length > 35;
  // Session IDs that look like Hermes internal IDs (timestamped or cron-)
  // are shown truncated; human-readable names render in full.
  const isInternalId = /^\d{8}_/.test(id) || id.startsWith("cron_");
  const label = isInternalId && isLong ? id.slice(0, 35) + "…" : id;

  return (
    <li className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-panel">
      <StatusDot active={session.is_active} />
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[13px] text-marble" title={id}>
          {label}
        </div>
        <div className="mt-0.5 font-mono text-[10.5px] text-mutedlo">
          {fmtDate(session.created_at)}
        </div>
      </div>
      <span className="shrink-0 font-mono text-[10px] text-mutedlo">
        {ago(session.created_at)}
      </span>
    </li>
  );
}

// ─── Shared exports (used by the logs tab) ──────────────────────────────

export { ago as honchoAgo, fmtTime as honchoFmtTime };

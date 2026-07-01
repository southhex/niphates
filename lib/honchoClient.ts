// Browser-side client for the Honcho API proxy.
// All calls go through /api/honcho-proxy/* which reads the Honcho config
// server-side and proxies to the Honcho REST API.

export interface HxResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

/** Generic call to any Honcho v3 API endpoint via the proxy. */
export async function honchoFetch<T = unknown>(
  subPath: string,
  init?: RequestInit,
): Promise<HxResult<T>> {
  const clean = subPath.startsWith("/") ? subPath : `/${subPath}`;
  try {
    const res = await fetch(`/api/honcho-proxy${clean}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const error =
        (data && typeof data === "object" && "error" in data
          ? String((data as { error: unknown }).error)
          : null) || `HTTP ${res.status}`;
      return { ok: false, status: res.status, data: data as T, error };
    }
    return { ok: true, status: res.status, data: data as T };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Types ──────────────────────────────────────────────────────────────

export interface HonchoPeer {
  id: string;
  workspace_id: string;
  created_at: string;
  metadata: Record<string, unknown>;
  configuration: Record<string, unknown>;
}

export interface HonchoSession {
  id: string;
  is_active: boolean;
  workspace_id: string;
  created_at: string;
  metadata: Record<string, unknown>;
  configuration: Record<string, unknown>;
}

export interface HonchoMessage {
  id: string;
  session_id: string;
  peer_id: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
  token_count?: number;
  workspace_id?: string;
}

export interface HonchoPaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export interface HonchoPeerContext {
  peer_id: string;
  target_id: string;
  representation: string;
  peer_card?: string[];
}

/** Per-session queue stats from /queue/status. */
export interface HonchoSessionQueue {
  session_id: string;
  total_work_units: number;
  completed_work_units: number;
  in_progress_work_units: number;
  pending_work_units: number;
}

export interface HonchoQueueStatus {
  total_work_units: number;
  completed_work_units: number;
  in_progress_work_units: number;
  pending_work_units: number;
  sessions?: Record<string, HonchoSessionQueue>;
}

export interface HonchoConfig {
  baseUrl: string;
  workspace: string;
  peerName: string;
  aiPeer: string;
  enabled: boolean;
  hasApiKey: boolean;
  recallMode: string;
  sessionStrategy: string;
  dialecticReasoningLevel: string;
  dialecticCadence: number;
  writeFrequency: string;
  saveMessages: boolean;
  observationMode: string;
  /** Active host keys from honcho.json (e.g. ["hermes", "hermes_worker"]). */
  hosts: string[];
}

// ─── API ────────────────────────────────────────────────────────────────

/** The default workspace ID from the Honcho config. */
export const DEFAULT_WORKSPACE = "hermes";

export const honchoApi = {
  // Config
  config: () => honchoFetch<{ config: HonchoConfig }>("/config"),

  // Peers
  listPeers: (workspace: string, page = 1, size = 50) =>
    honchoFetch<HonchoPaginatedResponse<HonchoPeer>>(
      `/v3/workspaces/${encodeURIComponent(workspace)}/peers/list?page=${page}&size=${size}`,
      { method: "POST", body: JSON.stringify({ filters: {} }) },
    ),

  getPeerContext: (workspace: string, peerId: string, tokens = 500) =>
    honchoFetch<HonchoPeerContext>(
      `/v3/workspaces/${encodeURIComponent(workspace)}/peers/${encodeURIComponent(peerId)}/context?tokens=${tokens}`,
    ),

  // Sessions
  listSessions: (workspace: string, page = 1, size = 20, reverse = true) =>
    honchoFetch<HonchoPaginatedResponse<HonchoSession>>(
      `/v3/workspaces/${encodeURIComponent(workspace)}/sessions/list?page=${page}&size=${size}&reverse=${reverse}`,
      { method: "POST", body: JSON.stringify({ filters: {} }) },
    ),

  getSessionMessages: (workspace: string, sessionId: string, size = 5) =>
    honchoFetch<HonchoPaginatedResponse<HonchoMessage>>(
      `/v3/workspaces/${encodeURIComponent(workspace)}/sessions/${encodeURIComponent(sessionId)}/messages/list?size=${size}&reverse=true`,
      { method: "POST", body: JSON.stringify({ filters: {} }) },
    ),

  // Queue / dream pipeline
  queueStatus: (workspace: string) =>
    honchoFetch<HonchoQueueStatus>(
      `/v3/workspaces/${encodeURIComponent(workspace)}/queue/status`,
    ),

  // Dreams
  scheduleDream: (workspace: string, observer: string, dreamType = "omni", observed?: string) =>
    honchoFetch<{ detail: unknown }>(
      `/v3/workspaces/${encodeURIComponent(workspace)}/schedule_dream`,
      {
        method: "POST",
        body: JSON.stringify({
          observer,
          dream_type: dreamType,
          observed: observed || observer,
          session_id: null,
        }),
      },
    ),
};
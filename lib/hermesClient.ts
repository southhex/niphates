// Browser-side typed client for the Hermes management API.
//
// Everything goes through the `/api/hx/*` proxy, so adding a new control
// feature is just adding a method here — no server changes needed. `hx()` is
// the generic escape hatch for endpoints we haven't typed yet.

export interface HxResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

/** Generic call to any Hermes /api/<path> endpoint via the proxy. */
export async function hx<T = unknown>(
  apiSubPath: string,
  init?: RequestInit,
): Promise<HxResult<T>> {
  const clean = apiSubPath.startsWith("/") ? apiSubPath : `/${apiSubPath}`;
  try {
    const res = await fetch(`/api/hx${clean}`, {
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

// --- Typed convenience wrappers (extend as features land) ----------------

export interface ModelInfo {
  model?: string;
  provider?: string;
  [k: string]: unknown;
}
export interface ModelOptions {
  models?: Array<string | { id?: string; name?: string; provider?: string }>;
  providers?: string[];
  [k: string]: unknown;
}

export const hermesApi = {
  // Models
  modelInfo: () => hx<ModelInfo>("/model/info"),
  modelOptions: () => hx<ModelOptions>("/model/options"),
  setModel: (model: string, provider?: string) =>
    hx<ModelInfo>("/model/set", {
      method: "PUT",
      body: JSON.stringify({ model, ...(provider ? { provider } : {}) }),
    }),

  // System / health
  systemStats: () => hx<Record<string, unknown>>("/system/stats"),

  // Cron (read-only here for now; writes added when the UI lands)
  cronJobs: () => hx<{ jobs?: unknown[] } | unknown[]>("/cron/jobs"),

  // Sessions
  sessions: () => hx<{ sessions?: unknown[] } | unknown[]>("/sessions"),
  searchSessions: (q: string) =>
    hx(`/sessions/search?q=${encodeURIComponent(q)}`),
};

// --- Connection config (separate, non-proxied endpoints) -----------------

export interface PublicHermesConnection {
  adminBaseUrl: string;
  authMode: "auto" | "none" | "bearer" | "cookie";
  hasToken: boolean;
  isLoopback: boolean;
}

export async function getConnection(): Promise<PublicHermesConnection | null> {
  const res = await fetch("/api/hermes/connection");
  if (!res.ok) return null;
  const d = await res.json();
  return d.connection as PublicHermesConnection;
}

export async function saveConnection(body: {
  adminBaseUrl: string;
  authMode: string;
  token?: string;
}): Promise<{ ok: boolean; error?: string; connection?: PublicHermesConnection }> {
  const res = await fetch("/api/hermes/connection", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: d.error || `HTTP ${res.status}` };
  return { ok: true, connection: d.connection };
}

export interface ConnectionTest {
  ok: boolean;
  reachable?: boolean;
  authenticated?: boolean;
  loopback?: boolean;
  model?: string | null;
  provider?: string | null;
  status?: number;
  error?: string;
}

export async function testConnection(): Promise<ConnectionTest> {
  const res = await fetch("/api/hermes/connection/test", { method: "POST" });
  return (await res.json()) as ConnectionTest;
}

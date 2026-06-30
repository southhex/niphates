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

export interface HermesPricing {
  input?: string;
  output?: string;
  cache?: string | null;
  free?: boolean;
}

export interface HermesUpstream {
  slug: string;
  name: string;
  is_current: boolean;
  models: string[];
  total_models: number;
  unavailable_models: string[];
  free_tier?: boolean;
  authenticated?: boolean;
  pricing?: Record<string, HermesPricing>;
}

export interface ModelOptions {
  model?: string;
  provider?: string;
  providers?: HermesUpstream[];
}

export const hermesApi = {
  // Models
  modelInfo: () => hx<ModelInfo>("/model/info"),
  modelOptions: () => hx<ModelOptions>("/model/options"),
  // Hermes' /api/model/set only accepts POST and validates a model-assignment
  // body. The active/primary model lives under scope "main" (PUT → 405; a body
  // without `scope` → 422). `confirm_expensive_model` mirrors the dashboard's
  // confirm checkbox — the catalog shows per-model pricing, so the click is the
  // confirmation.
  setModel: (model: string, provider?: string) =>
    hx<ModelInfo>("/model/set", {
      method: "POST",
      body: JSON.stringify({
        scope: "main",
        model,
        provider: provider ?? "",
        confirm_expensive_model: true,
      }),
    }),

  // System / health
  systemStats: () => hx<Record<string, unknown>>("/system/stats"),

  // Cron (read-only here for now; writes added when the UI lands)
  cronJobs: () => hx<{ jobs?: unknown[] } | unknown[]>("/cron/jobs"),

  // Sessions
  sessions: () => hx<{ sessions?: unknown[] } | unknown[]>("/sessions"),
  searchSessions: (q: string) =>
    hx(`/sessions/search?q=${encodeURIComponent(q)}`),
  renameSession: (sessionId: string, title: string) =>
    hx<{ session?: unknown }>(`/sessions/${encodeURIComponent(sessionId)}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),

  // Profiles (the composer picks which profile answers a Gateway chat)
  profiles: () => hx<ProfilesResponse>("/profiles"),
  activeProfile: () => hx<ActiveProfileResponse>("/profiles/active"),
  // Switch a specific profile's underlying LLM (global server-side state).
  // `PUT /api/profiles/{name}/model` requires both provider and model.
  setProfileModel: (name: string, model: string, provider: string) =>
    hx<HermesProfile>(`/profiles/${encodeURIComponent(name)}/model`, {
      method: "PUT",
      body: JSON.stringify({ provider, model }),
    }),
};

export interface HermesProfile {
  name: string;
  is_default?: boolean;
  model?: string;
  provider?: string;
  description?: string;
}
export interface ProfilesResponse {
  profiles?: HermesProfile[];
}
export interface ActiveProfileResponse {
  active?: string;
  current?: string;
}

// --- Connection config (separate, non-proxied endpoints) -----------------

export interface PublicHermesConnection {
  adminBaseUrl: string;
  authMode: "none" | "cookie";
  hasToken: boolean;
  isLoopback: boolean;
  chatBaseUrl?: string;
  hasChatKey: boolean;
  /** Per-provider composer model allowlist. Empty/undefined = show all. */
  allowedModels?: Record<string, string[]>;
}

/** Persist the per-provider composer model allowlist (Command → Models filter). */
export async function saveAllowedModels(
  allowedModels: Record<string, string[]>,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/hermes/connection", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ allowedModels }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    return { ok: false, error: d.error || `HTTP ${res.status}` };
  }
  return { ok: true };
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
  chatBaseUrl?: string;
  chatKey?: string;
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
  /** True when the stored session cookie is no longer valid (UI should prompt re-login). */
  session_expired?: boolean;
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

/**
 * Trade dashboard username + password for a session cookie. The cookie is
 * stored server-side and credentials are discarded. Used by the Settings
 * UI's login modal.
 */
export async function login(
  username: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/hermes/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const d = (await res.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!res.ok) return { ok: false, error: d.error || `HTTP ${res.status}` };
  return { ok: true };
}

/** Clear the stored session cookie. hermesFetch also calls this on 401. */
export async function logout(): Promise<PublicHermesConnection | null> {
  const res = await fetch("/api/hermes/logout", { method: "POST" });
  if (!res.ok) return null;
  const d = (await res.json().catch(() => ({}))) as {
    connection?: PublicHermesConnection;
  };
  return d.connection ?? null;
}

// Server-side Hermes Agent admin client.
//
// This is the single place that knows how to reach Hermes' management API
// (the `/api/*` "control plane" exposed by the dashboard) and how to
// authenticate to it. Everything else — the proxy route, the typed client,
// the UI — goes through `hermesFetch`, so when auth needs to change we change
// it (here, or in the pure ./hermesAuth helpers) and nowhere else.
//
// Auth policy + loopback detection live in ./hermesAuth (pure, testable);
// this module owns the disk persistence and the authenticated fetch.
//
// Server-only: never import into a client component.

import "server-only";
import { createJsonStore } from "./jsonStore";
import {
  authHeaders,
  isLoopbackUrl,
  toPublicConnection,
  type HermesAuthMode,
  type HermesConnection,
  type PublicHermesConnection,
} from "./hermesAuth";

export {
  isLoopbackUrl,
  toPublicConnection,
  type HermesAuthMode,
  type HermesConnection,
  type PublicHermesConnection,
};

function seedFromEnv(): HermesConnection {
  return {
    adminBaseUrl: process.env.HERMES_ADMIN_URL || "http://127.0.0.1:9119",
    authMode: (process.env.HERMES_ADMIN_AUTH as HermesAuthMode) || "auto",
    token: process.env.HERMES_ADMIN_TOKEN || "",
    username: process.env.HERMES_ADMIN_USERNAME || "",
    password: process.env.HERMES_ADMIN_PASSWORD || "",
    chatBaseUrl: process.env.HERMES_BASE_URL || "http://127.0.0.1:8642/v1",
    chatKey: process.env.HERMES_API_KEY || "",
  };
}

// data/hermes.json — seed merges *under* the stored file so new fields get
// sane defaults for existing installs.
const store = createJsonStore<HermesConnection>({
  filename: "hermes.json",
  seed: seedFromEnv,
  merge: (seed, parsed) => ({ ...seed, ...parsed }),
});

export async function getHermesConnection(): Promise<HermesConnection> {
  return store.read();
}

export async function saveHermesConnection(
  conn: HermesConnection,
): Promise<HermesConnection> {
  // Invalidate session cache when connection config changes
  sessionCache = null;
  return store.write(conn);
}

export interface HermesFetchInit {
  method?: string;
  /** Raw request body (already serialized). */
  body?: string | undefined;
  /** Extra headers (e.g. Content-Type for writes). */
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Per-request timeout in ms (default 15s). */
  timeoutMs?: number;
}

// --- Basic auth session management (in-memory, never persisted) ---

interface SessionCache {
  cookie: string;
  connFingerprint: string; // invalidated when connection config changes
}

let sessionCache: SessionCache | null = null;
let loginPromise: Promise<SessionCache | null> | null = null;

/** Fingerprint the connection config so we know when to re-auth. */
function connFingerprint(conn: HermesConnection): string {
  return `${conn.adminBaseUrl}|${conn.username}|${conn.password}`;
}

/**
 * Authenticate against the Hermes dashboard's /auth/password-login endpoint.
 * Returns the hermes_session_at cookie value for use on subsequent API calls.
 */
async function basicLogin(conn: HermesConnection): Promise<SessionCache | null> {
  if (!conn.username || !conn.password) return null;

  const base = conn.adminBaseUrl.replace(/\/$/, "");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(`${base}/auth/password-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "basic",
        username: conn.username,
        password: conn.password,
        next: "",
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;

    // Extract the access token cookie from the Set-Cookie header.
    // The value is quoted: hermes_session_at="<token>"; ...
    const setCookie = res.headers.get("set-cookie");
    const atMatch = setCookie?.match(/hermes_session_at=([^;]+)/);
    if (!atMatch) return null;
    // Strip surrounding quotes if present
    let tokenVal = atMatch[1];
    if (tokenVal.startsWith('"') && tokenVal.endsWith('"')) {
      tokenVal = tokenVal.slice(1, -1);
    }

    return {
      cookie: `hermes_session_at=${tokenVal}`,
      connFingerprint: connFingerprint(conn),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Make an authenticated request to a Hermes management path.
 * `path` is the upstream path including its leading "/api/..." segment and any
 * query string, e.g. "/api/model/info" or "/api/sessions/search?q=foo".
 */
export async function hermesFetch(
  apiPath: string,
  init: HermesFetchInit = {},
): Promise<Response> {
  const conn = await getHermesConnection();
  const base = conn.adminBaseUrl.replace(/\/$/, "");
  const url = base + (apiPath.startsWith("/") ? apiPath : `/${apiPath}`);

  // Build auth headers. For basic auth mode, transparently login and use the
  // session cookie (the dashboard doesn't accept Basic auth directly on API
  // endpoints — it requires a session cookie from /auth/password-login).
  let extraHeaders: Record<string, string> = {};
  if (conn.authMode === "basic") {
    const fp = connFingerprint(conn);
    if (!sessionCache || sessionCache.connFingerprint !== fp) {
      // Deduplicate concurrent login attempts
      if (!loginPromise) {
        loginPromise = basicLogin(conn);
      }
      sessionCache = await loginPromise;
      loginPromise = null;
    }
    if (sessionCache) {
      extraHeaders["Cookie"] = sessionCache.cookie;
    }
  } else {
    extraHeaders = authHeaders(conn);
  }

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 15000);
  // If the caller passed a signal, abort our controller when it aborts.
  if (init.signal) {
    if (init.signal.aborted) ctrl.abort();
    else init.signal.addEventListener("abort", () => ctrl.abort());
  }

  try {
    return await fetch(url, {
      method: init.method || "GET",
      headers: { ...extraHeaders, ...(init.headers || {}) },
      body: init.body,
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/** Normalize fetch errors into a short human string. */
export function hermesError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "AbortError") return "Request timed out / aborted";
    // undici connection refused etc. surface as "fetch failed"
    if (err.message === "fetch failed") {
      return "Could not reach Hermes — is the dashboard running and the URL correct?";
    }
    return err.message;
  }
  return String(err);
}
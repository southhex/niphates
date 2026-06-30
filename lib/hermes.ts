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
    authMode: ((process.env.HERMES_ADMIN_AUTH as HermesAuthMode) || "none") as HermesAuthMode,
    token: process.env.HERMES_ADMIN_TOKEN || "",
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
  return store.write(conn);
}

/**
 * Clear the stored session cookie without touching anything else. Called by
 * the logout endpoint and by hermesFetch itself when it sees a 401, so the
 * UI's next test will report "needs login" rather than hitting Hermes with
 * a stale cookie.
 */
export async function clearHermesCookie(): Promise<HermesConnection> {
  const current = await store.read();
  const next: HermesConnection = { ...current, token: "" };
  return store.write(next);
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

/**
 * Sentinel for "the stored session cookie is no longer valid." The proxy
 * route and connection-test endpoint translate this into a JSON field so the
 * UI can prompt re-login instead of just showing a generic HTTP 401.
 */
export class HermesSessionExpiredError extends Error {
  constructor() {
    super("Session expired");
    this.name = "HermesSessionExpiredError";
  }
}

/**
 * Make an authenticated request to a Hermes management path.
 * `path` is the upstream path including its leading "/api/..." segment and any
 * query string, e.g. "/api/model/info" or "/api/sessions/search?q=foo".
 *
 * Auth policy: in "cookie" mode, the stored `hermes_session_at=…` value is
 * sent on every request. If Hermes returns 401, the cookie is cleared and a
 * HermesSessionExpiredError is thrown so the caller can prompt re-login.
 */
export async function hermesFetch(
  apiPath: string,
  init: HermesFetchInit = {},
): Promise<Response> {
  const conn = await getHermesConnection();
  const base = conn.adminBaseUrl.replace(/\/$/, "");
  const url = base + (apiPath.startsWith("/") ? apiPath : `/${apiPath}`);

  const extraHeaders = authHeaders(conn);

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 15000);
  // If the caller passed a signal, abort our controller when it aborts.
  if (init.signal) {
    if (init.signal.aborted) ctrl.abort();
    else init.signal.addEventListener("abort", () => ctrl.abort());
  }

  try {
    const res = await fetch(url, {
      method: init.method || "GET",
      headers: { ...extraHeaders, ...(init.headers || {}) },
      body: init.body,
      signal: ctrl.signal,
    });
    // Cookie mode + 401 → the stored session is no longer valid. Drop it so
    // the next probe doesn't repeat the same 401, and surface a typed error
    // so the route can return a structured "needs re-login" response.
    if (
      res.status === 401 &&
      conn.authMode === "cookie" &&
      conn.token
    ) {
      await clearHermesCookie();
      throw new HermesSessionExpiredError();
    }
    return res;
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

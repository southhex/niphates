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
      headers: { ...authHeaders(conn), ...(init.headers || {}) },
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

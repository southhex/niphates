// Server-side Hermes Agent admin client.
//
// This is the single place that knows how to reach Hermes' management API
// (the `/api/*` "control plane" exposed by the dashboard) and how to
// authenticate to it. Everything else — the proxy route, the typed client,
// the UI — goes through `hermesFetch`, so when auth needs to change we change
// it here and nowhere else.
//
// Auth model (per Hermes docs): the dashboard `/api/*` endpoints are open on a
// loopback bind but require a session cookie / OAuth token on a non-loopback
// bind. We capture that as an explicit, configurable policy.
//
// Server-only: never import into a client component.

import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_PATH = path.join(DATA_DIR, "hermes.json");

export type HermesAuthMode = "auto" | "none" | "bearer" | "cookie";

export interface HermesConnection {
  /** Dashboard / management base URL. Hermes' dashboard defaults to :9119. */
  adminBaseUrl: string;
  /**
   * How to authenticate to `/api/*`:
   * - "auto"   : no auth on loopback; bearer token otherwise (if present)
   * - "none"   : never send auth
   * - "bearer" : Authorization: Bearer <token>
   * - "cookie" : Cookie: <token>  (paste a dashboard session cookie)
   */
  authMode: HermesAuthMode;
  /** Secret token / cookie value. Stored server-side, never returned raw. */
  token?: string;
}

/** Public (redacted) view safe to send to the browser. */
export interface PublicHermesConnection {
  adminBaseUrl: string;
  authMode: HermesAuthMode;
  hasToken: boolean;
  isLoopback: boolean;
}

function seedFromEnv(): HermesConnection {
  return {
    adminBaseUrl: process.env.HERMES_ADMIN_URL || "http://127.0.0.1:9119",
    authMode: (process.env.HERMES_ADMIN_AUTH as HermesAuthMode) || "auto",
    token: process.env.HERMES_ADMIN_TOKEN || "",
  };
}

export function isLoopbackUrl(urlStr: string): boolean {
  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "[::1]" ||
      host.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

export async function getHermesConnection(): Promise<HermesConnection> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<HermesConnection>;
    // Merge over the env seed so new fields get sane defaults.
    return { ...seedFromEnv(), ...parsed } as HermesConnection;
  } catch {
    const seeded = seedFromEnv();
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(CONFIG_PATH, JSON.stringify(seeded, null, 2), "utf8");
    return seeded;
  }
}

export async function saveHermesConnection(
  conn: HermesConnection,
): Promise<HermesConnection> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(conn, null, 2), "utf8");
  return conn;
}

export function toPublicConnection(c: HermesConnection): PublicHermesConnection {
  return {
    adminBaseUrl: c.adminBaseUrl,
    authMode: c.authMode,
    hasToken: Boolean(c.token),
    isLoopback: isLoopbackUrl(c.adminBaseUrl),
  };
}

/** Resolve the auth headers to send for a given connection. */
function authHeaders(conn: HermesConnection): Record<string, string> {
  const loopback = isLoopbackUrl(conn.adminBaseUrl);
  let mode = conn.authMode;
  if (mode === "auto") mode = loopback ? "none" : conn.token ? "bearer" : "none";

  if (!conn.token) return {};
  if (mode === "bearer") return { Authorization: `Bearer ${conn.token}` };
  if (mode === "cookie") return { Cookie: conn.token };
  return {};
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

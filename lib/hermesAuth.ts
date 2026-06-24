// Pure Hermes management-auth policy: connection shape, loopback detection,
// and header resolution. No secrets fetching, no "server-only" — so the auth
// logic (the easy thing to get subtly wrong) is unit-testable. `lib/hermes.ts`
// re-exports these and owns the disk/fetch side.

export type HermesAuthMode = "auto" | "none" | "bearer" | "cookie" | "session" | "basic";

export interface HermesConnection {
  /** Dashboard / management base URL. Hermes' dashboard defaults to :9119. */
  adminBaseUrl: string;
  /**
   * How to authenticate to `/api/*`:
   * - "auto"    : no auth on loopback; bearer token otherwise (if present)
   * - "none"    : never send auth
   * - "bearer"  : Authorization: Bearer <token>
   * - "cookie"  : Cookie: <token>  (paste a dashboard session cookie)
   * - "session" : X-Hermes-Session-Token: <token>  (Hermes dashboard session token)
   * - "basic"   : Authorization: Basic <base64(username:password)>  (dashboard basic auth)
   */
  authMode: HermesAuthMode;
  /** Secret token / cookie value. Stored server-side, never returned raw. */
  token?: string;
  /** Username for basic auth mode. Stored server-side, never returned raw. */
  username?: string;
  /** Password for basic auth mode. Stored server-side, never returned raw. */
  password?: string;
  /**
   * Inference (`/v1`) base URL for chat. Hermes's chat plane is a separate port
   * (default :8642) from the management plane (:9119) above, so it's stored
   * separately — but it belongs to the same Gateway connection. We POST to
   * `${chatBaseUrl}/chat/completions`.
   */
  chatBaseUrl?: string;
  /** Secret inference API key (Bearer). Stored server-side, never returned raw. */
  chatKey?: string;
  /**
   * Per-provider model allowlist for the composer model picker.
   * Key = provider slug (e.g. "openrouter"), value = list of model ids.
   * Empty/undefined means "no filter — show all". Set from Command → Models.
   */
  allowedModels?: Record<string, string[]>;
}

/** Public (redacted) view safe to send to the browser. */
export interface PublicHermesConnection {
  adminBaseUrl: string;
  authMode: HermesAuthMode;
  hasToken: boolean;
  hasUsername: boolean;
  hasPassword: boolean;
  isLoopback: boolean;
  chatBaseUrl?: string;
  hasChatKey: boolean;
  /** Per-provider composer model allowlist (not a secret). Empty/undefined = all. */
  allowedModels?: Record<string, string[]>;
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

/** Resolve the auth headers to send for a given connection. */
export function authHeaders(conn: HermesConnection): Record<string, string> {
  const loopback = isLoopbackUrl(conn.adminBaseUrl);
  let mode = conn.authMode;
  if (mode === "auto") mode = loopback ? "none" : conn.token ? "bearer" : "none";

  if (mode === "bearer") {
    if (conn.token) return { Authorization: `Bearer ${conn.token}` };
    return {};
  }
  if (mode === "cookie") {
    if (conn.token) return { Cookie: conn.token };
    return {};
  }
  if (mode === "session") {
    if (conn.token) return { "X-Hermes-Session-Token": conn.token };
    return {};
  }
  if (mode === "basic") {
    if (conn.username && conn.password) {
      const encoded = Buffer.from(`${conn.username}:${conn.password}`).toString("base64");
      return { Authorization: `Basic ${encoded}` };
    }
    return {};
  }
  // "none" or any unrecognized mode — no auth
  return {};
}

export function toPublicConnection(c: HermesConnection): PublicHermesConnection {
  return {
    adminBaseUrl: c.adminBaseUrl,
    authMode: c.authMode,
    hasToken: Boolean(c.token),
    hasUsername: Boolean(c.username),
    hasPassword: Boolean(c.password),
    isLoopback: isLoopbackUrl(c.adminBaseUrl),
    chatBaseUrl: c.chatBaseUrl,
    hasChatKey: Boolean(c.chatKey),
    allowedModels: c.allowedModels,
  };
}

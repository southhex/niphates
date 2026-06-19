// Pure Hermes management-auth policy: connection shape, loopback detection,
// and header resolution. No secrets fetching, no "server-only" — so the auth
// logic (the easy thing to get subtly wrong) is unit-testable. `lib/hermes.ts`
// re-exports these and owns the disk/fetch side.

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

  if (!conn.token) return {};
  if (mode === "bearer") return { Authorization: `Bearer ${conn.token}` };
  if (mode === "cookie") return { Cookie: conn.token };
  return {};
}

export function toPublicConnection(c: HermesConnection): PublicHermesConnection {
  return {
    adminBaseUrl: c.adminBaseUrl,
    authMode: c.authMode,
    hasToken: Boolean(c.token),
    isLoopback: isLoopbackUrl(c.adminBaseUrl),
  };
}

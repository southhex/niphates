// Pure Hermes management-auth policy: connection shape, loopback detection,
// and header resolution. No secrets fetching, no "server-only" — so the auth
// logic (the easy thing to get subtly wrong) is unit-testable. `lib/hermes.ts`
// re-exports these and owns the disk/fetch side.

/**
 * How to authenticate to `/api/*` on the Hermes dashboard.
 *
 * - "none"   : never send auth. Use when the admin URL is loopback and the
 *              dashboard has no auth configured.
 * - "cookie" : send a dashboard session cookie obtained from the
 *              `/auth/password-login` flow. The Settings UI prompts for
 *              username + password, the server logs in, and the resulting
 *              `hermes_session_at` cookie is what gets stored. The
 *              credentials themselves are never persisted.
 */
export type HermesAuthMode = "none" | "cookie";

export interface HermesConnection {
  /** Dashboard / management base URL. Hermes' dashboard defaults to :9119. */
  adminBaseUrl: string;
  /**
   * How to authenticate to `/api/*`. See HermesAuthMode for details. Most
   * installs will use "none" (loopback) or "cookie" (basic auth via the
   * dashboard login flow).
   */
  authMode: HermesAuthMode;
  /**
   * Secret session cookie value (e.g. `hermes_session_at=<token>`). Stored
   * server-side, never returned raw to the browser. Obtained from the
   * `/auth/password-login` flow; the UI clears it on logout.
   */
  token?: string;
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
  /** True when a session cookie is currently stored and ready to use. */
  hasToken: boolean;
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
  if (loopback && mode === "cookie" && !conn.token) {
    // Loopback without a stored cookie is "none" — don't send an empty
    // Cookie header.
    return {};
  }

  if (mode === "cookie") {
    if (conn.token) return { Cookie: conn.token };
    return {};
  }
  // "none" (the default) — never send auth.
  return {};
}

export function toPublicConnection(c: HermesConnection): PublicHermesConnection {
  return {
    adminBaseUrl: c.adminBaseUrl,
    authMode: c.authMode,
    hasToken: Boolean(c.token),
    isLoopback: isLoopbackUrl(c.adminBaseUrl),
    chatBaseUrl: c.chatBaseUrl,
    hasChatKey: Boolean(c.chatKey),
    allowedModels: c.allowedModels,
  };
}

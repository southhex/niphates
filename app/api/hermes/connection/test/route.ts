// Two-probe Hermes connection test: /api/model/info (unauthenticated, reachability)
// then /api/model/options (authenticated) to confirm the token separately.

import {
  getHermesConnection,
  hermesFetch,
  hermesError,
  isLoopbackUrl,
} from "@/lib/hermes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const conn = await getHermesConnection();
  const loopback = isLoopbackUrl(conn.adminBaseUrl);

  try {
    // /model/info is unauthenticated — proves reachability, not auth.
    const infoRes = await hermesFetch("/api/model/info", { timeoutMs: 8000 });
    if (!infoRes.ok) {
      const detail = await infoRes.text().catch(() => "");
      return Response.json({
        ok: false,
        reachable: false,
        loopback,
        status: infoRes.status,
        error: `HTTP ${infoRes.status}: ${detail.slice(0, 200)}`,
      });
    }
    const info = await infoRes.json().catch(() => ({}));

    // Reachability is proven. Probe an authenticated endpoint to confirm the
    // token. A separate try/catch so an auth-probe network error doesn't get
    // reported as unreachable. `authenticated` is true only on a 2xx — a 401/403
    // means the token is wrong; any other non-2xx (5xx, etc.) is not a
    // confirmed auth success, so we report false rather than guessing.
    let authenticated = false;
    try {
      const optRes = await hermesFetch("/api/model/options", { timeoutMs: 8000 });
      authenticated = optRes.ok;
    } catch {
      authenticated = false;
    }

    return Response.json({
      ok: true,
      reachable: true,
      authenticated,
      loopback,
      model: info?.model ?? info?.current ?? null,
      provider: info?.provider ?? null,
    });
  } catch (err) {
    return Response.json({ ok: false, reachable: false, loopback, error: hermesError(err) });
  }
}

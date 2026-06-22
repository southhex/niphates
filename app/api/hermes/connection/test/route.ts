// Probe the Hermes management API to confirm reachability + auth.
// Uses /api/model/info as a lightweight, always-present read endpoint.

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
        status: infoRes.status,
        error: `HTTP ${infoRes.status}: ${detail.slice(0, 200)}`,
      });
    }
    const info = await infoRes.json().catch(() => ({}));

    // /model/options requires a valid session token — use it to confirm auth.
    const optRes = await hermesFetch("/api/model/options", { timeoutMs: 8000 });
    const authenticated = optRes.status !== 401 && optRes.status !== 403;

    return Response.json({
      ok: true,
      reachable: true,
      authenticated,
      loopback,
      model: info?.model ?? info?.current ?? null,
      provider: info?.provider ?? null,
    });
  } catch (err) {
    return Response.json({ ok: false, reachable: false, error: hermesError(err) });
  }
}

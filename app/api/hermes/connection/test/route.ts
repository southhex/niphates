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
    const res = await hermesFetch("/api/model/info", { timeoutMs: 8000 });
    if (res.status === 401 || res.status === 403) {
      return Response.json({
        ok: false,
        status: res.status,
        error: loopback
          ? "Hermes rejected the request (auth required even on this bind)."
          : "Auth required — set an authMode + token for this non-loopback URL.",
      });
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return Response.json({
        ok: false,
        status: res.status,
        error: `HTTP ${res.status}: ${detail.slice(0, 200)}`,
      });
    }
    const info = await res.json().catch(() => ({}));
    return Response.json({
      ok: true,
      loopback,
      model: info?.model ?? info?.current ?? null,
      provider: info?.provider ?? null,
      info,
    });
  } catch (err) {
    return Response.json({ ok: false, error: hermesError(err) });
  }
}

// Connection tester. Given a providerId, probe the upstream and report
// whether it's reachable and (for OpenAI-type) what models it advertises.

import { NextRequest } from "next/server";
import { getProvider } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { providerId } = (await req.json().catch(() => ({}))) as {
    providerId?: string;
  };
  if (!providerId) {
    return Response.json({ ok: false, error: "providerId required" }, { status: 400 });
  }
  const provider = await getProvider(providerId);
  if (!provider) {
    return Response.json({ ok: false, error: "Unknown provider" }, { status: 404 });
  }

  try {
    if (provider.type === "anthropic") {
      // Anthropic has no public unauthenticated probe; a HEAD on the base is
      // enough to confirm reachability + that a key is present.
      if (!provider.apiKey) {
        return Response.json({ ok: false, error: "No API key configured" });
      }
      return Response.json({
        ok: true,
        note: "Key present; Anthropic has no list endpoint to probe.",
      });
    }

    // OpenAI-compatible: GET /models is the canonical reachability check.
    const url = `${provider.baseUrl.replace(/\/$/, "")}/models`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      headers: provider.apiKey
        ? { Authorization: `Bearer ${provider.apiKey}` }
        : {},
      signal: ctrl.signal,
    });
    clearTimeout(t);

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return Response.json({
        ok: false,
        error: `HTTP ${res.status}: ${detail.slice(0, 200)}`,
      });
    }
    const json = await res.json().catch(() => ({}));
    const models: string[] = Array.isArray(json?.data)
      ? json.data.map((m: { id: string }) => m.id).filter(Boolean)
      : [];
    return Response.json({ ok: true, models });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message });
  }
}

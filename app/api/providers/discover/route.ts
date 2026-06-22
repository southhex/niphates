// Discover the full model catalog a provider serves (OpenAI-compatible
// GET /models), cache it on the provider record, and return it. Hermes
// returns its profiles here. Anthropic-type has no list endpoint.

import { NextRequest } from "next/server";
import { getProvider, upsertProvider, HERMES_ID } from "@/lib/providers";
import { extractModelIds } from "@/lib/modelDiscovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { providerId } = (await req.json().catch(() => ({}))) as {
    providerId?: string;
  };
  if (!providerId) {
    return Response.json({ error: "providerId required" }, { status: 400 });
  }
  if (providerId === HERMES_ID) {
    return Response.json(
      { catalog: null, note: "Hermes models are profiles, managed via the Gateway." },
      { status: 400 },
    );
  }
  const provider = await getProvider(providerId);
  if (!provider) {
    return Response.json({ error: "Unknown provider" }, { status: 404 });
  }
  if (provider.type === "anthropic") {
    return Response.json({
      catalog: null,
      note: "Anthropic has no model-list endpoint; edit models in Settings.",
    });
  }

  const url = `${provider.baseUrl.replace(/\/$/, "")}/models`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: provider.apiKey
        ? { Authorization: `Bearer ${provider.apiKey}` }
        : {},
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return Response.json(
        { error: `HTTP ${res.status}: ${detail.slice(0, 200)}` },
        { status: 502 },
      );
    }
    const json = await res.json().catch(() => ({}));
    const catalog = extractModelIds(json);
    const catalogUpdatedAt = Date.now();
    await upsertProvider({ ...provider, catalog, catalogUpdatedAt });
    return Response.json({ catalog, catalogUpdatedAt });
  } catch (err) {
    clearTimeout(t);
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

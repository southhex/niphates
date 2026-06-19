// Provider configuration API.
//   GET    -> list providers (secrets stripped)
//   POST   -> upsert a provider (full object, may include apiKey)
//   DELETE -> remove a provider by ?id=

import { NextRequest } from "next/server";
import {
  getProviders,
  upsertProvider,
  deleteProvider,
  toPublic,
} from "@/lib/providers";
import type { Provider } from "@/lib/types";
import { providerSchema, formatZodError } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const providers = await getProviders();
  return Response.json({ providers: providers.map(toPublic) });
}

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = providerSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: formatZodError(parsed.error) },
      { status: 400 },
    );
  }
  const p: Provider = parsed.data;

  // If the client sends an empty apiKey, preserve the existing one instead of
  // wiping a stored secret (the UI never receives the real key back).
  if (p.apiKey === "" || p.apiKey === undefined) {
    const existing = (await getProviders()).find((x) => x.id === p.id);
    if (existing?.apiKey) p.apiKey = existing.apiKey;
  }
  const all = await upsertProvider(p);
  return Response.json({ providers: all.map(toPublic) });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  const all = await deleteProvider(id);
  return Response.json({ providers: all.map(toPublic) });
}

// Update ONLY the enabled `models` array for a provider — the set shown in the
// composer picker. A dedicated minimal route so curation can never touch the
// stored apiKey (unlike the full-object POST /api/providers).

import { NextRequest } from "next/server";
import { z } from "zod";
import { getProvider, upsertProvider, toPublic, HERMES_ID } from "@/lib/providers";
import { formatZodError } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ models: z.array(z.string()) });

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (id === HERMES_ID) {
    return Response.json(
      { error: "Hermes models are managed via the Gateway connection." },
      { status: 400 },
    );
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: formatZodError(parsed.error) }, { status: 400 });
  }
  const provider = await getProvider(id);
  if (!provider) {
    return Response.json({ error: "Unknown provider" }, { status: 404 });
  }
  const all = await upsertProvider({ ...provider, models: parsed.data.models });
  return Response.json({ providers: all.map(toPublic) });
}

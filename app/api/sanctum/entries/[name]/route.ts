// Single entry read/write:
//   GET  /api/sanctum/entries/[name] — read entry content
//   PUT  /api/sanctum/entries/[name] — update entry content (body: { content })

import { NextRequest } from "next/server";
import {
  getSanctumSettings,
  readEntry,
  writeEntry,
} from "@/lib/sanctum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ name: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const settings = await getSanctumSettings();
  if (!settings.connectorId) {
    return Response.json({ error: "No connector configured" }, { status: 400 });
  }
  const { name } = await ctx.params;
  const content = await readEntry(settings, decodeURIComponent(name));
  if (content === null) {
    return Response.json({ error: "Entry not found" }, { status: 404 });
  }
  return Response.json({ content });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const settings = await getSanctumSettings();
  if (!settings.connectorId) {
    return Response.json({ error: "No connector configured" }, { status: 400 });
  }
  const { name } = await ctx.params;
  const filename = decodeURIComponent(name);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const content =
    typeof raw === "object" && raw !== null && "content" in raw
      ? String((raw as Record<string, unknown>).content ?? "")
      : "";

  const ok = await writeEntry(settings, filename, content);
  if (!ok) {
    return Response.json({ error: "Failed to write entry" }, { status: 500 });
  }
  return Response.json({ ok: true });
}

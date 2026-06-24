// Sanctum entries list + create:
//   GET  /api/sanctum/entries — list all entries
//   POST /api/sanctum/entries — create new entry for today (body: { content })

import { NextRequest } from "next/server";
import {
  getSanctumSettings,
  listEntries,
  createEntry,
} from "@/lib/sanctum";
import { format } from "date-fns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getSanctumSettings();
  if (!settings.connectorId) {
    return Response.json({ entries: [], unconfigured: true });
  }
  const entries = await listEntries(settings);
  return Response.json({ entries });
}

export async function POST(req: NextRequest) {
  const settings = await getSanctumSettings();
  if (!settings.connectorId) {
    return Response.json({ error: "No connector configured" }, { status: 400 });
  }

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

  // Generate filename from template + today's date.
  const today = new Date();
  let filename: string;
  try {
    filename = format(today, settings.filenameTemplate);
  } catch {
    filename = format(today, "yyyy-MM-dd");
  }

  const ok = await createEntry(settings, filename, content);
  if (!ok) {
    return Response.json(
      { error: "Entry already exists or could not be created" },
      { status: 409 },
    );
  }

  return Response.json({ filename, ok: true }, { status: 201 });
}

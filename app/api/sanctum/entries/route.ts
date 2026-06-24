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

  const hasContent =
    typeof raw === "object" && raw !== null && "content" in raw;
  const providedContent = hasContent
    ? String((raw as Record<string, unknown>).content ?? "")
    : null;

  // Generate filename from template + today's date.
  const today = new Date();
  let filename: string;
  try {
    filename = format(today, settings.filenameTemplate);
  } catch {
    filename = format(today, "yyyy-MM-dd");
  }

  // New notes start empty — the human-readable title is derived from the
  // filename on the Niphates side (see deriveTitle in SanctumView), never
  // written into the markdown body.
  const seedContent = providedContent ?? "";

  // Idempotent "open today's note": create if absent, otherwise just return the
  // existing filename so the client opens it. Never an error for the user.
  await createEntry(settings, filename, seedContent);

  return Response.json({ filename, ok: true }, { status: 200 });
}

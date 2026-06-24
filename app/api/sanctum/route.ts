// Sanctum settings: GET current settings, PUT update.

import { NextRequest } from "next/server";
import {
  getSanctumSettings,
  saveSanctumSettings,
  type SanctumSettings,
} from "@/lib/sanctum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getSanctumSettings();
  return Response.json({ settings });
}

export async function PUT(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return Response.json({ error: "Expected a JSON object" }, { status: 400 });
  }

  const current = await getSanctumSettings();
  const r = raw as Record<string, unknown>;

  const next: SanctumSettings = {
    connectorId:
      typeof r.connectorId === "string" && r.connectorId.trim()
        ? r.connectorId.trim()
        : current.connectorId,
    folder:
      typeof r.folder === "string" && r.folder.trim()
        ? r.folder.trim()
        : current.folder,
    filenameTemplate:
      typeof r.filenameTemplate === "string" && r.filenameTemplate.trim()
        ? r.filenameTemplate.trim()
        : current.filenameTemplate,
  };

  const saved = await saveSanctumSettings(next);
  return Response.json({ settings: saved });
}

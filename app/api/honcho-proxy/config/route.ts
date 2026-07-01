// Sanitized Honcho config for the dashboard.
// Reads the Honcho config from disk (server-side) and returns a cleaned view
// to the browser — no API keys, no tokens. The honcho baseUrl is not secret
// (it's a local LAN address) but we keep it here so the dashboard can show it.

import { NextRequest, NextResponse } from "next/server";
import { readHonchoConfig, toPublicConfig } from "@/lib/honchoConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const raw = readHonchoConfig();
  return NextResponse.json({ config: toPublicConfig(raw) });
}

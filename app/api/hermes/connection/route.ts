// Manage the Hermes management connection (admin base URL + auth policy).
// The token is stored server-side and never returned to the browser.

import { NextRequest } from "next/server";
import {
  getHermesConnection,
  saveHermesConnection,
  toPublicConnection,
  type HermesAuthMode,
  type HermesConnection,
} from "@/lib/hermes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const conn = await getHermesConnection();
  return Response.json({ connection: toPublicConnection(conn) });
}

export async function PUT(req: NextRequest) {
  let incoming: Partial<HermesConnection>;
  try {
    incoming = (await req.json()) as Partial<HermesConnection>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const current = await getHermesConnection();
  const next: HermesConnection = {
    adminBaseUrl: (incoming.adminBaseUrl ?? current.adminBaseUrl).trim(),
    authMode: (incoming.authMode ?? current.authMode) as HermesAuthMode,
    // Blank/undefined token means "keep the existing one".
    token:
      incoming.token === "" || incoming.token === undefined
        ? current.token
        : incoming.token,
  };

  if (!next.adminBaseUrl) {
    return Response.json({ error: "adminBaseUrl is required" }, { status: 400 });
  }
  try {
    // Validate URL shape early so we fail loudly in the UI.
    new URL(next.adminBaseUrl);
  } catch {
    return Response.json({ error: "adminBaseUrl is not a valid URL" }, { status: 400 });
  }

  await saveHermesConnection(next);
  return Response.json({ connection: toPublicConnection(next) });
}

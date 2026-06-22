// Manage the Hermes management connection (admin base URL + auth policy).
// The token is stored server-side and never returned to the browser.

import { NextRequest } from "next/server";
import {
  getHermesConnection,
  saveHermesConnection,
  toPublicConnection,
  type HermesConnection,
} from "@/lib/hermes";
import { hermesConnectionInputSchema, formatZodError } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const conn = await getHermesConnection();
  return Response.json({ connection: toPublicConnection(conn) });
}

export async function PUT(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = hermesConnectionInputSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: formatZodError(parsed.error) },
      { status: 400 },
    );
  }
  const incoming = parsed.data;

  const current = await getHermesConnection();
  const next: HermesConnection = {
    adminBaseUrl: (incoming.adminBaseUrl ?? current.adminBaseUrl).trim(),
    authMode: incoming.authMode ?? current.authMode,
    // Blank/undefined token means "keep the existing one".
    token:
      incoming.token === "" || incoming.token === undefined
        ? current.token
        : incoming.token,
    chatBaseUrl: (incoming.chatBaseUrl ?? current.chatBaseUrl)?.trim(),
    // Blank/undefined chatKey means "keep the existing one".
    chatKey:
      incoming.chatKey === "" || incoming.chatKey === undefined
        ? current.chatKey
        : incoming.chatKey,
  };

  if (!next.adminBaseUrl) {
    return Response.json({ error: "adminBaseUrl is required" }, { status: 400 });
  }

  await saveHermesConnection(next);
  return Response.json({ connection: toPublicConnection(next) });
}

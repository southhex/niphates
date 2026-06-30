// POST /api/hermes/login
// Trade username + password for a dashboard session cookie. The cookie is
// returned to the browser which then PUTs it onto the stored connection via
// /api/hermes/connection. Credentials are never written to disk.

import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getHermesConnection,
  saveHermesConnection,
  hermesError,
} from "@/lib/hermes";
import { formatZodError } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loginInputSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = loginInputSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: formatZodError(parsed.error) },
      { status: 400 },
    );
  }
  const { username, password } = parsed.data;

  const conn = await getHermesConnection();
  const base = conn.adminBaseUrl.replace(/\/$/, "");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(`${base}/auth/password-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "basic",
        username,
        password,
        next: "",
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return Response.json(
        {
          error: `Dashboard rejected credentials (HTTP ${res.status})${
            detail ? `: ${detail.slice(0, 200)}` : ""
          }`,
        },
        { status: 401 },
      );
    }

    // Hermes sets `hermes_session_at="<token>"; …` on success. Extract the
    // access token, strip surrounding quotes, and store the full cookie pair
    // string for re-use on subsequent calls.
    const setCookie = res.headers.get("set-cookie");
    const atMatch = setCookie?.match(/hermes_session_at=([^;]+)/);
    if (!atMatch) {
      return Response.json(
        { error: "Login succeeded but no session cookie was returned." },
        { status: 502 },
      );
    }
    let tokenVal = atMatch[1];
    if (tokenVal.startsWith('"') && tokenVal.endsWith('"')) {
      tokenVal = tokenVal.slice(1, -1);
    }
    const cookie = `hermes_session_at=${tokenVal}`;

    // Persist the cookie alongside the existing config. If `authMode` was
    // "none" we promote it to "cookie" so the new session actually gets used.
    const next = { ...conn, token: cookie, authMode: "cookie" as const };
    await saveHermesConnection(next);

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: hermesError(err) }, { status: 502 });
  } finally {
    clearTimeout(t);
  }
}

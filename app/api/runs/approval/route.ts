// Proxies an approval response from the browser to the Hermes gateway.
// The gateway Runs API requires POST /v1/runs/{runId}/approval with
// {approval_id, choice} to unblock a tool that is waiting for user consent.

import "server-only";
import { NextRequest } from "next/server";
import { getHermesConnection } from "@/lib/hermes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { runId?: string; approvalId?: string; choice?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { runId, approvalId, choice } = body;
  if (!runId || !approvalId || !choice) {
    return Response.json(
      { error: "runId, approvalId, and choice are required" },
      { status: 400 },
    );
  }

  const conn = await getHermesConnection();
  const base = (conn.chatBaseUrl ?? "http://127.0.0.1:8642/v1").replace(/\/$/, "");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (conn.chatKey) headers["Authorization"] = `Bearer ${conn.chatKey}`;

  try {
    const res = await fetch(`${base}/runs/${runId}/approval`, {
      method: "POST",
      headers,
      body: JSON.stringify({ approval_id: approvalId, choice }),
      signal: req.signal,
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 502 });
  }
}

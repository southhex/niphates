// Hermes management proxy.
//
// Forwards `/api/hx/<rest>` → Hermes `<adminBaseUrl>/api/<rest>`, injecting
// auth server-side via hermesFetch. This means the browser can reach any
// Hermes `/api/*` management endpoint without ever seeing the token and
// without CORS, and every future control feature (cron, sessions, config,
// MCP, …) works through this one route with zero new server code.
//
// Example: GET /api/hx/model/info        -> GET  <base>/api/model/info
//          PUT /api/hx/model/set         -> PUT  <base>/api/model/set
//          GET /api/hx/sessions/search?q=x -> GET <base>/api/sessions/search?q=x

import { NextRequest } from "next/server";
import { hermesFetch, hermesError } from "@/lib/hermes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path?: string[] }> };

async function proxy(req: NextRequest, ctx: Ctx): Promise<Response> {
  const { path } = await ctx.params;
  const sub = "/api/" + (path?.map(encodeURIComponent).join("/") ?? "");
  const upstreamPath = sub + req.nextUrl.search;

  const method = req.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  const body = hasBody ? await req.text() : undefined;

  try {
    const res = await hermesFetch(upstreamPath, {
      method,
      body,
      headers: hasBody
        ? {
            "Content-Type":
              req.headers.get("content-type") || "application/json",
          }
        : undefined,
      signal: req.signal,
    });

    // Pass the upstream response straight through (status + body + type).
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: {
        "Content-Type":
          res.headers.get("content-type") || "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return Response.json({ error: hermesError(err) }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;

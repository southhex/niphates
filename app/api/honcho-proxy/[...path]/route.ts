// Server-side proxy to the Honcho API.
//
// Reads the Honcho config from ~/.hermes/honcho.json to find the base URL
// and (optional) API key, then forwards the request. This lets the browser
// reach the Honcho v3 REST API without ever seeing the Honcho URL or key.
//
// Route: /api/honcho-proxy/{rest}
// Maps to: {honchoBaseUrl}/{rest}
//
// Note: the dedicated /api/honcho-proxy/config route sits alongside this one
// and is *not* a Honcho API endpoint — it returns a sanitized view of the
// Honcho config to the dashboard.

import { NextRequest } from "next/server";
import { readHonchoConfig } from "@/lib/honchoConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(
  req: NextRequest,
  ctx: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  const params = await ctx.params;
  const subPath = params.path?.join("/") ?? "";
  const config = readHonchoConfig();
  const baseUrl = config.baseUrl || "http://localhost:8000";

  const url = `${baseUrl.replace(/\/$/, "")}/${subPath}${req.nextUrl.search}`;

  const method = req.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  const body = hasBody ? await req.text() : undefined;

  const headers: Record<string, string> = {
    "Content-Type": req.headers.get("content-type") || "application/json",
  };
  // Pass through the API key if the config has one. Self-hosted Honcho
  // instances running with AUTH_USE_AUTH=false simply ignore it.
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      signal: req.signal,
    });

    // 204 No Content / 205 Reset Content / 304 Not Modified have no body
    // and a `Response` constructed with an empty string body throws
    // `Invalid response status code`. `Response(null)` is the correct shape.
    // For 1xx/204/205/304 we also drop Content-Length/Content-Type since
    // the spec forbids a body.
    if (res.status === 204 || res.status === 205 || res.status === 304) {
      return new Response(null, {
        status: res.status,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const text = await res.text();
    const upstreamType = res.headers.get("content-type");
    return new Response(text, {
      status: res.status,
      headers: {
        "Content-Type": upstreamType || "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `Honcho proxy error: ${msg}` },
      { status: 502 },
    );
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;

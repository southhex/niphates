// Streaming chat proxy. The browser POSTs a conversation here; we look up the
// provider server-side (so the API key never reaches the client), call the
// upstream, and stream back newline-delimited JSON events:
//   {"type":"delta","text":"..."}   incremental assistant text
//   {"type":"error","error":"..."}  something went wrong
//   {"type":"done"}                 stream finished

import { NextRequest } from "next/server";
import { getProvider } from "@/lib/providers";
import { streamChat } from "@/lib/connectors";
import type { ChatRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { providerId, model, messages, temperature } = body;
  if (!providerId || !model || !Array.isArray(messages)) {
    return Response.json(
      { error: "providerId, model and messages are required" },
      { status: 400 },
    );
  }

  const provider = await getProvider(providerId);
  if (!provider) {
    return Response.json(
      { error: `Unknown provider: ${providerId}` },
      { status: 404 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        for await (const delta of streamChat(provider, {
          model,
          messages,
          temperature,
          signal: req.signal,
        })) {
          send({ type: "delta", text: delta });
        }
        send({ type: "done" });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

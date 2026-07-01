// Streaming chat proxy. The browser POSTs a conversation here; we look up the
// provider server-side (so the API key never reaches the client), call the
// upstream, and stream back newline-delimited JSON events:
//   {"type":"delta","text":"..."}     incremental assistant text
//   {"type":"reasoning","text":"..."} agent reasoning/thinking preview
//   {"type":"tool","tool":"...","status":"started"|"completed",...}  tool activity
//   {"type":"error","error":"..."}    something went wrong
//   {"type":"done"}                   stream finished

import { NextRequest } from "next/server";
import { getProvider } from "@/lib/providers";
import { streamChat } from "@/lib/connectors";
import { chatRequestSchema, formatZodError } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = chatRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: formatZodError(parsed.error) },
      { status: 400 },
    );
  }
  const { providerId, model, messages, temperature, maxTokens, conversationId, hermesSessionId } =
    parsed.data;

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
        for await (const ev of streamChat(provider, {
          model,
          messages,
          temperature,
          maxTokens,
          conversationId,
          hermesSessionId,
          signal: req.signal,
        })) {
          if (ev.kind === "text") send({ type: "delta", text: ev.text });
          else if (ev.kind === "reasoning")
            send({ type: "reasoning", text: ev.text });
          else if (ev.kind === "tool")
            send({
              type: "tool",
              tool: ev.tool,
              status: ev.status,
              preview: ev.preview,
              durationMs: ev.durationMs,
              error: ev.error,
            });
          else if (ev.kind === "run_started")
            send({ type: "run_started", runId: ev.runId });
          else if (ev.kind === "session_updated")
            send({ type: "session_updated", sessionId: ev.sessionId });
          else if (ev.kind === "approval")
            send({
              type: "approval",
              approvalId: ev.approvalId,
              tool: ev.tool,
              command: ev.command,
              description: ev.description,
              patternKeys: ev.patternKeys,
            });
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

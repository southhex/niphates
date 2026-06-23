// Pure mapper: one Hermes gateway Runs-API SSE payload → a normalized
// StreamEvent. Kept free of "server-only" and of any I/O so the parsing — the
// part most likely to break against a Hermes version bump — is unit-testable in
// plain Node (vitest), mirroring lib/sse.ts.
//
// Observed event vocabulary (Hermes v0.17.0, GET /v1/runs/{id}/events):
//   {"event":"message.delta","delta":"..."}            incremental answer text
//   {"event":"reasoning.available","text":"..."}       reasoning/thinking preview
//   {"event":"tool.started","tool":"...","preview":"..."}
//   {"event":"tool.completed","tool":"...","duration":0.1,"error":false}
//   {"event":"run.completed","output":"...","usage":{...}}

import type { StreamEvent } from "./types";

export function mapRunsEvent(payload: string): StreamEvent | null {
  if (!payload || payload === "[DONE]") return null;
  let e: Record<string, unknown>;
  try {
    e = JSON.parse(payload);
  } catch {
    return null;
  }

  switch (e.event) {
    case "message.delta":
      return typeof e.delta === "string" ? { kind: "text", text: e.delta } : null;

    case "reasoning.available":
      return typeof e.text === "string"
        ? { kind: "reasoning", text: e.text }
        : null;

    case "tool.started":
      return {
        kind: "tool",
        tool: String(e.tool ?? ""),
        status: "started",
        preview: typeof e.preview === "string" ? e.preview : undefined,
      };

    case "tool.completed":
      return {
        kind: "tool",
        tool: String(e.tool ?? ""),
        status: "completed",
        durationMs:
          e.duration != null && !Number.isNaN(Number(e.duration))
            ? Math.round(Number(e.duration) * 1000)
            : undefined,
        error: Boolean(e.error),
      };

    case "run.completed":
      return { kind: "done" };

    // The gateway Runs API names this event "approval.request" (older builds
    // prefix it "hermes."). The tool name arrives as tool/function_name; the id
    // as approval_id or id. Verified against nesquena/hermes-webui gateway_chat.
    case "approval.request":
    case "hermes.approval.request":
      return {
        kind: "approval",
        approvalId: String(e.approval_id ?? e.id ?? ""),
        tool:
          typeof e.tool === "string"
            ? e.tool
            : typeof e.function_name === "string"
              ? e.function_name
              : undefined,
        command: typeof e.command === "string" ? e.command : "",
        description: typeof e.description === "string" ? e.description : undefined,
        patternKeys: Array.isArray(e.pattern_keys)
          ? (e.pattern_keys as unknown[]).map(String)
          : undefined,
      };

    default:
      // run.started, usage pings, and anything we don't model yet are ignored.
      return null;
  }
}

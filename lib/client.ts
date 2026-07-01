// Client helper: POST a chat request and yield assistant text deltas as they
// arrive. Parses the NDJSON event stream produced by /api/chat.

import type { ChatMessage, ToolEvent } from "./types";

export interface StreamHandlers {
  onDelta: (text: string) => void;
  /** Hermes agent reasoning/thinking preview chunk. */
  onReasoning?: (text: string) => void;
  /** A tool.started / tool.completed event for the current turn. */
  onTool?: (event: ToolEvent) => void;
  /** Run id for the active Hermes gateway run (used to respond to approvals). */
  onRunStarted?: (runId: string) => void;
  /**
   * Hermes has rotated the session id (context compression — issue #16938).
   * The browser should persist the new id on the conversation and reuse it on
   * the next turn so the request lands on the compressed continuation.
   */
  onSessionIdUpdated?: (sessionId: string) => void;
  /** A Hermes tool approval gate — agent is paused waiting for user consent. */
  onApproval?: (req: {
    approvalId: string;
    tool?: string;
    command: string;
    description?: string;
    patternKeys?: string[];
  }) => void;
  onError?: (message: string) => void;
  onDone?: () => void;
}

export async function streamChatRequest(
  params: {
    providerId: string;
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    /** Conversation id → Hermes Runs session_id for server-side context. */
    conversationId?: string;
    /**
     * Hermes-rotated session id, sent in preference to conversationId when
     * present. The browser should update this value on `onSessionIdUpdated`.
     */
    hermesSessionId?: string;
  },
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal,
  });

  if (!res.ok || !res.body) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* ignore */
    }
    handlers.onError?.(msg);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        const evt = JSON.parse(line);
        if (evt.type === "delta") handlers.onDelta(evt.text);
        else if (evt.type === "reasoning") handlers.onReasoning?.(evt.text);
        else if (evt.type === "tool")
          handlers.onTool?.({
            tool: evt.tool,
            status: evt.status,
            preview: evt.preview,
            durationMs: evt.durationMs,
            error: evt.error,
          });
        else if (evt.type === "run_started") handlers.onRunStarted?.(evt.runId);
        else if (evt.type === "session_updated")
          handlers.onSessionIdUpdated?.(evt.sessionId);
        else if (evt.type === "approval")
          handlers.onApproval?.({
            approvalId: evt.approvalId,
            tool: evt.tool,
            command: evt.command,
            description: evt.description,
            patternKeys: evt.patternKeys,
          });
        else if (evt.type === "error") handlers.onError?.(evt.error);
        else if (evt.type === "done") handlers.onDone?.();
      } catch {
        /* skip malformed line */
      }
    }
  }
  handlers.onDone?.();
}

/** Send an approval decision for a paused Hermes run. */
export async function approvalResponse(
  runId: string,
  approvalId: string,
  choice: "once" | "session" | "always" | "deny",
): Promise<void> {
  await fetch("/api/runs/approval", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runId, approvalId, choice }),
  }).catch(() => {});
}

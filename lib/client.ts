// Client helper: POST a chat request and yield assistant text deltas as they
// arrive. Parses the NDJSON event stream produced by /api/chat.

import type { ChatMessage } from "./types";

export interface StreamHandlers {
  onDelta: (text: string) => void;
  onError?: (message: string) => void;
  onDone?: () => void;
}

export async function streamChatRequest(
  params: {
    providerId: string;
    model: string;
    messages: ChatMessage[];
    temperature?: number;
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
        else if (evt.type === "error") handlers.onError?.(evt.error);
        else if (evt.type === "done") handlers.onDone?.();
      } catch {
        /* skip malformed line */
      }
    }
  }
  handlers.onDone?.();
}

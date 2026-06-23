// Provider connectors: turn a provider + messages into a stream of text
// deltas. Server-only. Each connector normalizes its upstream SSE into a
// single async iterator of plain text chunks so the API route stays simple.
// SSE parsing lives in ./sse (pure + testable); this file owns the wire calls.

import "server-only";
import type { ChatMessage, Provider, ProviderType, StreamEvent } from "./types";
import { sseLines, extractOpenAIDelta, extractAnthropicDelta } from "./sse";
import { mapRunsEvent } from "./runsEvents";

export interface StreamOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  /** Max output tokens; falls back to the provider default then a sane cap. */
  maxTokens?: number;
  /**
   * The conversation id, used as the Hermes Runs `session_id` so the agent
   * keeps server-side context across turns. Ignored by stateless connectors.
   */
  conversationId?: string;
  signal?: AbortSignal;
}

type Connector = (
  provider: Provider,
  opts: StreamOptions,
) => AsyncGenerator<StreamEvent>;

/** OpenAI-compatible: Ollama, OpenRouter, OpenAI, KiloCode, etc. */
async function* openaiStream(
  provider: Provider,
  opts: StreamOptions,
): AsyncGenerator<StreamEvent> {
  const url = `${provider.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const maxTokens = opts.maxTokens ?? provider.maxTokens;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
      ...(provider.extraHeaders || {}),
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature,
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
      stream: true,
    }),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Upstream ${provider.name} returned ${res.status}: ${detail.slice(0, 500)}`,
    );
  }

  for await (const payload of sseLines(res.body)) {
    if (payload === "[DONE]") return;
    if (!payload) continue;
    const delta = extractOpenAIDelta(payload);
    if (delta) yield { kind: "text", text: delta };
  }
}

/**
 * Hermes Agent via the gateway Runs API. Unlike /chat/completions (which only
 * returns the final text), the Runs API surfaces the agent loop: reasoning and
 * tool calls. Flow: POST /runs → {run_id}; GET /runs/{id}/events (SSE) →
 * normalize each event; on abort, best-effort POST /runs/{id}/stop.
 */
async function* hermesRunsStream(
  provider: Provider,
  opts: StreamOptions,
): AsyncGenerator<StreamEvent> {
  const base = provider.baseUrl.replace(/\/$/, ""); // e.g. http://host:8642/v1
  const auth: Record<string, string> = provider.apiKey
    ? { Authorization: `Bearer ${provider.apiKey}` }
    : {};

  // With server-side sessions, only the latest user turn is the run input;
  // Hermes reconstructs prior context from session_id.
  const lastUser = [...opts.messages].reverse().find((m) => m.role === "user");

  const startRes = await fetch(`${base}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify({
      input: lastUser?.content ?? "",
      source: "niphates",
      ...(opts.conversationId ? { session_id: opts.conversationId } : {}),
      // For the Gateway provider the selected "model" is a Hermes profile name.
      ...(opts.model ? { profile: opts.model } : {}),
    }),
    signal: opts.signal,
  });
  if (!startRes.ok) {
    const detail = await startRes.text().catch(() => "");
    throw new Error(
      `Hermes run failed (${startRes.status}): ${detail.slice(0, 500)}`,
    );
  }
  const { run_id: runId } = (await startRes.json()) as { run_id?: string };
  if (!runId) throw new Error("Hermes run did not return a run_id");

  // Let the browser track the active run id so it can respond to approval requests.
  yield { kind: "run_started" as const, runId };

  const evRes = await fetch(`${base}/runs/${runId}/events`, {
    headers: auth,
    signal: opts.signal,
  });
  if (!evRes.ok || !evRes.body) {
    const detail = await evRes.text().catch(() => "");
    throw new Error(
      `Hermes events stream failed (${evRes.status}): ${detail.slice(0, 500)}`,
    );
  }

  try {
    for await (const payload of sseLines(evRes.body)) {
      const ev = mapRunsEvent(payload);
      if (!ev) continue;
      if (ev.kind === "done") return;
      yield ev;
    }
  } finally {
    // The events SSE has no resume cursor; if the client aborted, tell Hermes to
    // stop the run server-side so it isn't left working in the background.
    if (opts.signal?.aborted) {
      fetch(`${base}/runs/${runId}/stop`, {
        method: "POST",
        headers: auth,
      }).catch(() => {});
    }
  }
}

/** Anthropic Messages API. Different request/response shape. */
async function* anthropicStream(
  provider: Provider,
  opts: StreamOptions,
): AsyncGenerator<StreamEvent> {
  const url = `${provider.baseUrl.replace(/\/$/, "")}/v1/messages`;
  // Anthropic wants the system prompt as a top-level field, not a message.
  const system = opts.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const messages = opts.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": provider.apiKey || "",
      "anthropic-version": "2023-06-01",
      ...(provider.extraHeaders || {}),
    },
    body: JSON.stringify({
      model: opts.model,
      system: system || undefined,
      messages,
      // Anthropic requires max_tokens; honor request > provider > default.
      max_tokens: opts.maxTokens ?? provider.maxTokens ?? 4096,
      temperature: opts.temperature,
      stream: true,
    }),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Upstream ${provider.name} returned ${res.status}: ${detail.slice(0, 500)}`,
    );
  }

  for await (const payload of sseLines(res.body)) {
    if (!payload) continue;
    const delta = extractAnthropicDelta(payload);
    if (delta) yield { kind: "text", text: delta };
  }
}

// Dispatch table keyed by provider type. Add a new wire format by adding an
// entry here; everything upstream (the chat route) stays untouched.
const connectors: Record<ProviderType, Connector> = {
  openai: openaiStream,
  anthropic: anthropicStream,
};

export function streamChat(
  provider: Provider,
  opts: StreamOptions,
): AsyncGenerator<StreamEvent> {
  // The synthesized Hermes (Gateway) provider speaks the agentic Runs API, not
  // plain /chat/completions — that's how we get live reasoning + tool events.
  if (provider.kind === "gateway") return hermesRunsStream(provider, opts);
  const connector = connectors[provider.type] ?? openaiStream;
  return connector(provider, opts);
}

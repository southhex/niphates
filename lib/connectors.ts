// Provider connectors: turn a provider + messages into a stream of text
// deltas. Server-only. Each connector normalizes its upstream SSE into a
// single async iterator of plain text chunks so the API route stays simple.
// SSE parsing lives in ./sse (pure + testable); this file owns the wire calls.

import "server-only";
import type { ChatMessage, Provider, ProviderType } from "./types";
import { sseLines, extractOpenAIDelta, extractAnthropicDelta } from "./sse";

export interface StreamOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  /** Max output tokens; falls back to the provider default then a sane cap. */
  maxTokens?: number;
  signal?: AbortSignal;
}

type Connector = (
  provider: Provider,
  opts: StreamOptions,
) => AsyncGenerator<string>;

/** OpenAI-compatible: Hermes, Ollama, OpenRouter, OpenAI, KiloCode, etc. */
async function* openaiStream(
  provider: Provider,
  opts: StreamOptions,
): AsyncGenerator<string> {
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
    if (delta) yield delta;
  }
}

/** Anthropic Messages API. Different request/response shape. */
async function* anthropicStream(
  provider: Provider,
  opts: StreamOptions,
): AsyncGenerator<string> {
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
    if (delta) yield delta;
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
): AsyncGenerator<string> {
  const connector = connectors[provider.type] ?? openaiStream;
  return connector(provider, opts);
}

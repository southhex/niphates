// Provider connectors: turn a provider + messages into a stream of text
// deltas. Server-only. Both connectors normalize their upstream SSE into a
// single async iterator of plain text chunks so the API route stays simple.

import "server-only";
import type { ChatMessage, Provider } from "./types";

export interface StreamOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  signal?: AbortSignal;
}

/** Parse an SSE byte stream into individual `data:` payload strings. */
async function* sseLines(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE events are separated by a blank line; data lines start with "data:".
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line.startsWith("data:")) {
          yield line.slice(5).trim();
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** OpenAI-compatible: Hermes, Ollama, OpenRouter, OpenAI, KiloCode, etc. */
async function* openaiStream(
  provider: Provider,
  opts: StreamOptions,
): AsyncGenerator<string> {
  const url = `${provider.baseUrl.replace(/\/$/, "")}/chat/completions`;
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
    try {
      const json = JSON.parse(payload);
      const delta: string | undefined = json?.choices?.[0]?.delta?.content;
      if (delta) yield delta;
    } catch {
      // Hermes also emits custom progress events (hermes.tool.progress);
      // ignore anything we can't parse as a content delta.
    }
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
      max_tokens: 4096,
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
    try {
      const json = JSON.parse(payload);
      if (
        json.type === "content_block_delta" &&
        json.delta?.type === "text_delta"
      ) {
        yield json.delta.text as string;
      }
    } catch {
      // ignore keep-alives / non-JSON
    }
  }
}

export function streamChat(
  provider: Provider,
  opts: StreamOptions,
): AsyncGenerator<string> {
  return provider.type === "anthropic"
    ? anthropicStream(provider, opts)
    : openaiStream(provider, opts);
}

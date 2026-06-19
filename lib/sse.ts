// Pure SSE parsing helpers, shared by the provider connectors.
//
// Kept free of secrets and of "server-only" so this logic — the part most
// likely to break subtly — is unit-testable in plain Node (vitest).

/** Parse an SSE byte stream into individual `data:` payload strings. */
export async function* sseLines(
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

/** Pull the text delta out of an OpenAI-shaped chunk, or null if none. */
export function extractOpenAIDelta(payload: string): string | null {
  try {
    const json = JSON.parse(payload);
    const delta = json?.choices?.[0]?.delta?.content;
    return typeof delta === "string" ? delta : null;
  } catch {
    // Hermes also emits custom progress events; ignore anything unparseable.
    return null;
  }
}

/** Pull the text delta out of an Anthropic stream event, or null if none. */
export function extractAnthropicDelta(payload: string): string | null {
  try {
    const json = JSON.parse(payload);
    if (
      json.type === "content_block_delta" &&
      json.delta?.type === "text_delta"
    ) {
      return json.delta.text as string;
    }
    return null;
  } catch {
    return null;
  }
}

import { describe, it, expect } from "vitest";
import {
  sseLines,
  extractOpenAIDelta,
  extractAnthropicDelta,
} from "../lib/sse";

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(enc.encode(chunk));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const out: string[] = [];
  for await (const line of sseLines(stream)) out.push(line);
  return out;
}

describe("sseLines", () => {
  it("yields data payloads and ignores non-data lines", async () => {
    const out = await collect(
      streamFrom([
        "event: ping\n",
        "data: hello\n",
        "\n",
        "data: world\n",
      ]),
    );
    expect(out).toEqual(["hello", "world"]);
  });

  it("reassembles payloads split across chunk boundaries", async () => {
    const out = await collect(streamFrom(["data: hel", "lo\n", "data: wor", "ld\n"]));
    expect(out).toEqual(["hello", "world"]);
  });

  it("passes the [DONE] sentinel through as a payload", async () => {
    const out = await collect(streamFrom(["data: [DONE]\n"]));
    expect(out).toEqual(["[DONE]"]);
  });
});

describe("extractOpenAIDelta", () => {
  it("pulls the content delta", () => {
    const payload = JSON.stringify({ choices: [{ delta: { content: "hi" } }] });
    expect(extractOpenAIDelta(payload)).toBe("hi");
  });

  it("returns null for a delta with no content (e.g. role-only)", () => {
    const payload = JSON.stringify({ choices: [{ delta: { role: "assistant" } }] });
    expect(extractOpenAIDelta(payload)).toBeNull();
  });

  it("returns null for non-JSON (Hermes progress events)", () => {
    expect(extractOpenAIDelta("not json")).toBeNull();
  });
});

describe("extractAnthropicDelta", () => {
  it("pulls text from a content_block_delta", () => {
    const payload = JSON.stringify({
      type: "content_block_delta",
      delta: { type: "text_delta", text: "yo" },
    });
    expect(extractAnthropicDelta(payload)).toBe("yo");
  });

  it("ignores other event types (e.g. message_start)", () => {
    const payload = JSON.stringify({ type: "message_start" });
    expect(extractAnthropicDelta(payload)).toBeNull();
  });
});

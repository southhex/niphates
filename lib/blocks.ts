// Pure helpers for working with `ChatBlock[]` and the streaming reducers that
// build it. Kept framework-agnostic so the same code is reachable from the
// client (`page.tsx` streaming handler, `MessageList` renderer) and from unit
// tests under `tests/`.

import type { ChatBlock, ChatMessage, ToolEvent } from "./types";

/**
 * Collapse runs of adjacent text blocks into a single block whose `text` is
 * the concatenation of all of them. The plan explicitly asks for this so
 * ReactMarkdown re-renders one accumulated answer (matches the pre-blocks
 * behavior) instead of N tiny paragraphs. Other block types pass through.
 */
export function mergeAdjacentText(blocks: ChatBlock[]): ChatBlock[] {
  const merged: ChatBlock[] = [];
  for (const block of blocks) {
    if (
      block.type === "text" &&
      merged.length > 0 &&
      merged[merged.length - 1].type === "text"
    ) {
      const last = merged[merged.length - 1] as Extract<ChatBlock, { type: "text" }>;
      merged[merged.length - 1] = {
        type: "text",
        text: last.text + block.text,
      };
    } else {
      merged.push({ ...block });
    }
  }
  return merged;
}

/**
 * Append a streamed text delta to an in-flight assistant message. Adjacent
 * deltas merge into the trailing text block so the block list doesn't grow
 * one entry per token. The flat `content` field is also kept in sync for
 * backward-compat read paths (search, persistence, legacy renderer).
 */
export function appendTextDelta(last: ChatMessage, delta: string): ChatMessage {
  const blocks = [...(last.blocks ?? [])];
  const lastBlock = blocks[blocks.length - 1];
  if (lastBlock?.type === "text") {
    blocks[blocks.length - 1] = {
      type: "text",
      text: lastBlock.text + delta,
    };
  } else {
    blocks.push({ type: "text", text: delta });
  }
  return { ...last, content: last.content + delta, blocks };
}

/**
 * Append a streamed reasoning delta. Mirrors `appendTextDelta` but for
 * reasoning blocks, and updates the legacy `reasoning` flat field.
 */
export function appendReasoningDelta(last: ChatMessage, text: string): ChatMessage {
  const blocks = [...(last.blocks ?? [])];
  const lastBlock = blocks[blocks.length - 1];
  if (lastBlock?.type === "reasoning") {
    blocks[blocks.length - 1] = {
      type: "reasoning",
      text: lastBlock.text + text,
    };
  } else {
    blocks.push({ type: "reasoning", text });
  }
  return {
    ...last,
    reasoning: (last.reasoning ?? "") + text,
    blocks,
  };
}

/**
 * Apply a `tool.started` / `tool.completed` event to the in-flight assistant
 * message. Walks `blocks` (and `toolCalls`) backwards to settle the most
 * recent matching `started` event — this mirrors how Hermes' run-events API
 * emits the pair, and the plan accepts that the first matching open call
 * wins. Returns a new `ChatMessage`; never mutates `last`.
 */
export function applyToolEvent(last: ChatMessage, event: ToolEvent): ChatMessage {
  const blocks = [...(last.blocks ?? [])];
  const calls = [...(last.toolCalls ?? [])];

  if (event.status === "completed") {
    // Settle the most recent matching `started` tool block.
    let blockUpdated = false;
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      if (b.type === "tool" && b.tool === event.tool && b.status === "started") {
        blocks[i] = { ...b, ...event };
        blockUpdated = true;
        break;
      }
    }
    if (!blockUpdated) blocks.push({ type: "tool", ...event });

    // Mirror against the flat toolCalls array for backward-compat read paths.
    for (let i = calls.length - 1; i >= 0; i--) {
      if (calls[i].tool === event.tool && calls[i].status === "started") {
        calls[i] = { ...calls[i], ...event };
        return { ...last, toolCalls: calls, blocks };
      }
    }
  } else {
    // tool.started — push a fresh block
    blocks.push({ type: "tool", ...event });
  }
  calls.push(event);
  return { ...last, toolCalls: calls, blocks };
}

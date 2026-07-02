// Project a Niphates conversation into the wire `conversation_history` the
// Hermes Runs API accepts. PURE + framework-agnostic (no "server-only") so it
// can be unit-tested and imported from the connector alike.
//
// Why this exists: Hermes' Runs API is *stateless for conversation content*.
// The agent builds the model's message list purely from the `conversation_history`
// we send (agent/turn_context.py: `messages = list(conversation_history)`), then
// appends the latest user turn. `session_id` only drives system-prompt
// prefix-caching, persistence, and long-term-memory scoping — it does NOT
// reconstruct the transcript. So if we don't send prior turns, the model has no
// memory of them, full stop.
//
// The API also only accepts `{role, content}` STRING pairs
// (api_server.py `_handle_runs` rejects entries missing either field and coerces
// both to `str`). Structured tool-call entries are dropped. So to preserve the
// assistant's tool work across turns — the whole point — we fold each assistant
// turn's tool commands and their outputs into that turn's `content` as readable
// text. Otherwise the model re-derives work it already did (re-running auth
// checks, re-reading files) and reaches for retrieval tools to recover context
// it should already have.

import type { ChatMessage, ChatBlock, ToolEvent } from "./types";

/** Cap per-tool output so a chatty command can't blow up the context. */
export const MAX_TOOL_OUTPUT = 2000;

export interface WireMessage {
  role: string;
  content: string;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n… [truncated ${s.length - max} chars]`;
}

/** Collapse whitespace to a single line and cap length — for the command gist. */
function condense(s: string, max = 200): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max)}…` : one;
}

/**
 * Render a past tool invocation (a `tool` ChatBlock or a legacy ToolEvent) as a
 * RETROSPECTIVE prose note — deliberately NOT a bracketed "[tool: x]" tag.
 *
 * The bracket form got parroted: a weak model (deepseek-v4-flash) saw prior
 * assistant turns formatted as `[tool: …]` and reproduced that literal string
 * as its own output instead of emitting a real structured tool call, so the UI
 * rendered raw text rather than a ToolCard. Past-tense prose ("ran X") reads as
 * a record of what already happened, not a format to imitate.
 *
 * The command is condensed to a single short line (its full text — e.g. a big
 * code block — is what made the echo egregious and isn't needed for
 * continuity); the *result* is what prevents re-derivation, so it keeps the
 * fuller capped output.
 */
function renderTool(t: Pick<ToolEvent, "tool" | "preview" | "output" | "error">): string {
  const verb = t.error ? "tried" : "ran";
  const cmd = t.preview?.trim() ? ` — ${condense(t.preview)}` : "";
  const out = t.output?.trim()
    ? `\n   result: ${truncate(t.output.trim(), MAX_TOOL_OUTPUT)}`
    : "";
  return `(${verb} ${t.tool}${cmd})${out}`;
}

/**
 * Flatten one assistant turn into wire text. Prefers the chronological `blocks`
 * (source of truth) — interleaving spoken text with tool commands/outputs in
 * arrival order — and falls back to the flat `content` + `toolCalls` for legacy
 * messages that predate blocks. `reasoning` blocks are intentionally omitted:
 * they're the model's ephemeral thinking preview, not answer content, and
 * re-feeding stale thinking is noise.
 */
function renderAssistant(m: ChatMessage): string {
  const parts: string[] = [];
  if (m.blocks && m.blocks.length) {
    for (const b of m.blocks as ChatBlock[]) {
      if (b.type === "text") {
        if (b.text.trim()) parts.push(b.text.trim());
      } else if (b.type === "tool") {
        parts.push(renderTool(b));
      }
      // reasoning blocks are dropped on purpose (see docstring)
    }
  } else {
    if (m.content?.trim()) parts.push(m.content.trim());
    for (const t of m.toolCalls ?? []) parts.push(renderTool(t));
  }
  return parts.join("\n\n");
}

/**
 * Convert prior conversation turns into the Runs API `conversation_history`.
 * Assistant turns carry their tool work inline; user/system turns pass through
 * as plain text. Turns that render empty are skipped so we never send blank
 * `content`.
 */
export function toConversationHistory(messages: ChatMessage[]): WireMessage[] {
  const out: WireMessage[] = [];
  for (const m of messages) {
    const content =
      m.role === "assistant" ? renderAssistant(m) : (m.content ?? "").trim();
    if (content) out.push({ role: m.role, content });
  }
  return out;
}

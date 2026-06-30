// Shared types for the app. Kept framework-agnostic so both the server
// (API routes) and client (UI) can import them.

/**
 * How we talk to a provider on the wire.
 * - "openai": OpenAI-compatible /v1/chat/completions. Covers Hermes Agent,
 *   Ollama, OpenRouter, KiloCode, OpenAI itself, and most others.
 * - "anthropic": Anthropic Messages API (different request/response shape).
 */
export type ProviderType = "openai" | "anthropic";

export interface Provider {
  /** Stable slug, e.g. "hermes", "ollama", "openrouter". */
  id: string;
  /** Human label shown in the UI. */
  name: string;
  type: ProviderType;
  /**
   * Where the connection lives. "direct" (default) is a standalone /v1 provider
   * managed in Settings → Connections → Providers. "gateway" is the Hermes Agent
   * entry synthesized from the Gateway connection — it isn't stored in
   * providers.json and isn't editable in the Providers CRUD.
   */
  kind?: "direct" | "gateway";
  /**
   * Base URL including the version path where appropriate.
   * For openai-type: ".../v1" (we POST to `${baseUrl}/chat/completions`).
   * For anthropic-type: "https://api.anthropic.com" (we POST to `${baseUrl}/v1/messages`).
   */
  baseUrl: string;
  /** Secret API key. Stored server-side only, never sent to the browser. */
  apiKey?: string;
  /** Models the user wants to expose for this provider. */
  models: string[];
  /** Full set of model ids last discovered from the provider (cached). */
  catalog?: string[];
  /** Epoch ms of the last successful discovery. */
  catalogUpdatedAt?: number;
  /** Optional default model id from `models`. */
  defaultModel?: string;
  /** Extra headers to send (e.g. OpenRouter ranking headers). */
  extraHeaders?: Record<string, string>;
  /** Set false to hide from the picker without deleting config. */
  enabled?: boolean;
  /**
   * Default max output tokens for this provider. Required by Anthropic
   * (defaults to 4096 if unset); ignored by OpenAI-type unless the connector
   * forwards it. A per-request value overrides this.
   */
  maxTokens?: number;
}

export type ChatRole = "system" | "user" | "assistant";

/**
 * A single tool invocation surfaced by an agent while it works. Hermes' Runs
 * API emits `tool.started` then `tool.completed`; we collapse the pair into one
 * record whose `status` advances from "started" to "completed".
 */
export interface ToolEvent {
  tool: string;
  status: "started" | "completed";
  /** Short preview of the tool input (e.g. the code/command being run). */
  preview?: string;
  /** Wall-clock duration once completed. */
  durationMs?: number;
  /** True if the tool finished with an error. */
  error?: boolean;
}

/** A chronological segment of an assistant message's turn. */
export type ChatBlock =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | {
      type: "tool";
      tool: string;
      status: "started" | "completed";
      preview?: string;
      durationMs?: number;
      error?: boolean;
    };

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** Assistant-only: reasoning/thinking preview streamed alongside the answer. */
  reasoning?: string;
  /** Assistant-only: tool activity for this turn (Hermes agent runs). */
  toolCalls?: ToolEvent[];
  /**
   * Chronological segments — source of truth for rendering when present.
   * Flat fields above are derived from these for backward-compat/search.
   */
  blocks?: ChatBlock[];
}

/**
 * Normalized streaming event yielded by every connector. The chat route maps
 * these onto the browser-facing ndjson protocol; the UI renders text, a
 * reasoning block, and tool cards from them. A new wire format only has to
 * produce these — see `lib/connectors.ts`.
 */
export type StreamEvent =
  | { kind: "text"; text: string }
  | { kind: "reasoning"; text: string }
  | {
      kind: "tool";
      tool: string;
      status: "started" | "completed";
      preview?: string;
      durationMs?: number;
      error?: boolean;
    }
  | { kind: "done" }
  /** Emitted immediately after the run is created so the browser can track the run id. */
  | { kind: "run_started"; runId: string }
  /** A Hermes approval gate: the agent is waiting for the user to approve a command. */
  | {
      kind: "approval";
      approvalId: string;
      /** The tool requesting approval (e.g. "execute_code", "write_file"). */
      tool?: string;
      command: string;
      description?: string;
      patternKeys?: string[];
    };

export interface ChatRequest {
  providerId: string;
  model: string;
  messages: ChatMessage[];
  /** Sampling temperature; provider default if omitted. */
  temperature?: number;
  /** Max output tokens; overrides the provider default if set. */
  maxTokens?: number;
}

export interface Conversation {
  id: string;
  title: string;
  providerId: string;
  model: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  /** Archived chats are hidden from the main list but kept on disk. */
  archived?: boolean;
}

/** What the client is allowed to see about a provider (no secrets). */
export interface PublicProvider {
  id: string;
  name: string;
  type: ProviderType;
  kind?: "direct" | "gateway";
  baseUrl: string;
  models: string[];
  catalog?: string[];
  catalogUpdatedAt?: number;
  defaultModel?: string;
  enabled?: boolean;
  hasKey: boolean;
}

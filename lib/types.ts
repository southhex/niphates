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
   * Base URL including the version path where appropriate.
   * For openai-type: ".../v1" (we POST to `${baseUrl}/chat/completions`).
   * For anthropic-type: "https://api.anthropic.com" (we POST to `${baseUrl}/v1/messages`).
   */
  baseUrl: string;
  /** Secret API key. Stored server-side only, never sent to the browser. */
  apiKey?: string;
  /** Models the user wants to expose for this provider. */
  models: string[];
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

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

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
}

/** What the client is allowed to see about a provider (no secrets). */
export interface PublicProvider {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  models: string[];
  defaultModel?: string;
  enabled?: boolean;
  hasKey: boolean;
}

// Server-side provider registry.
//
// For a self-hosted single-user app we keep things simple: provider configs
// (including API keys) live in a JSON file on disk at `data/providers.json`.
// On first run we seed it from environment variables so Hermes works out of
// the box. This module is server-only — never import it into a client component.

import "server-only";
import type { Provider, PublicProvider } from "./types";
import { createJsonStore } from "./jsonStore";

/** Build the default provider set from environment variables. */
function seedFromEnv(): Provider[] {
  const providers: Provider[] = [];

  // --- Hermes Agent (the priority connection) ---------------------------
  // Hermes exposes an OpenAI-compatible server. Default port 8642, base /v1.
  const hermesBase = process.env.HERMES_BASE_URL || "http://127.0.0.1:8642/v1";
  providers.push({
    id: "hermes",
    name: "Hermes Agent",
    type: "openai",
    baseUrl: hermesBase,
    apiKey: process.env.HERMES_API_KEY || "",
    models: (process.env.HERMES_MODELS || "hermes-agent")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
    defaultModel: "hermes-agent",
    enabled: true,
  });

  // --- Ollama (local models, OpenAI-compatible at /v1) ------------------
  if (process.env.OLLAMA_BASE_URL || process.env.OLLAMA_MODELS) {
    providers.push({
      id: "ollama",
      name: "Ollama",
      type: "openai",
      baseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1",
      apiKey: "ollama", // Ollama ignores the key but the client expects one.
      models: (process.env.OLLAMA_MODELS || "llama3.1")
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
      enabled: true,
    });
  }

  // --- OpenRouter -------------------------------------------------------
  if (process.env.OPENROUTER_API_KEY) {
    providers.push({
      id: "openrouter",
      name: "OpenRouter",
      type: "openai",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      models: (process.env.OPENROUTER_MODELS || "openai/gpt-4o-mini")
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
      extraHeaders: {
        "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
        "X-Title": "Niphates",
      },
      enabled: true,
    });
  }

  // --- OpenAI -----------------------------------------------------------
  if (process.env.OPENAI_API_KEY) {
    providers.push({
      id: "openai",
      name: "OpenAI",
      type: "openai",
      baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      apiKey: process.env.OPENAI_API_KEY,
      models: (process.env.OPENAI_MODELS || "gpt-4o-mini,gpt-4o")
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
      enabled: true,
    });
  }

  // --- Anthropic --------------------------------------------------------
  if (process.env.ANTHROPIC_API_KEY) {
    providers.push({
      id: "anthropic",
      name: "Anthropic",
      type: "anthropic",
      baseUrl: process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com",
      apiKey: process.env.ANTHROPIC_API_KEY,
      models: (process.env.ANTHROPIC_MODELS || "claude-sonnet-4-6,claude-opus-4-8")
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
      enabled: true,
    });
  }

  return providers;
}

// data/providers.json — seeded from env on first run, then authoritative.
const store = createJsonStore<Provider[]>({
  filename: "providers.json",
  seed: seedFromEnv,
});

export async function getProviders(): Promise<Provider[]> {
  return store.read();
}

export async function getProvider(id: string): Promise<Provider | undefined> {
  const all = await store.read();
  return all.find((p) => p.id === id);
}

export async function saveProviders(providers: Provider[]): Promise<void> {
  await store.write(providers);
}

/** Upsert a single provider by id. Atomic read-modify-write. */
export async function upsertProvider(provider: Provider): Promise<Provider[]> {
  return store.update((all) => {
    const idx = all.findIndex((p) => p.id === provider.id);
    if (idx === -1) return [...all, provider];
    const next = [...all];
    next[idx] = provider;
    return next;
  });
}

export async function deleteProvider(id: string): Promise<Provider[]> {
  return store.update((all) => all.filter((p) => p.id !== id));
}

/** Strip secrets before sending to the browser. */
export function toPublic(p: Provider): PublicProvider {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    baseUrl: p.baseUrl,
    models: p.models,
    defaultModel: p.defaultModel,
    enabled: p.enabled,
    hasKey: Boolean(p.apiKey),
  };
}

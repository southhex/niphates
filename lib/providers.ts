// Server-side provider registry.
//
// For a self-hosted single-user app we keep things simple: provider configs
// (including API keys) live in a JSON file on disk at `data/providers.json`.
// On first run we seed it from environment variables so Hermes works out of
// the box. This module is server-only — never import it into a client component.

import "server-only";
import type { Provider, PublicProvider } from "./types";
import { createJsonStore } from "./jsonStore";
import { getHermesConnection, saveHermesConnection } from "./hermes";

/** Stable id of the synthesized Hermes (Gateway) chat provider. */
export const HERMES_ID = "hermes";

/** Build the default provider set from environment variables. */
function seedFromEnv(): Provider[] {
  const providers: Provider[] = [];

  // NB: Hermes is intentionally NOT seeded here. The Hermes chat provider is
  // synthesized from the Gateway connection (see synthGatewayProvider) so the
  // single Gateway config owns both the management and /v1 chat planes.

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

// One-time migration: older installs seeded an editable `hermes` provider into
// providers.json. The Gateway now owns the chat (/v1) endpoint, so fold the
// legacy entry's baseUrl/apiKey into the Hermes connection and drop it from the
// store. The presence of the legacy entry is the only signal we need — once
// removed, this never runs again. Guarded so it runs at most once per process.
let migration: Promise<void> | null = null;
function ensureHermesMigrated(): Promise<void> {
  if (!migration) migration = doMigrateHermes();
  return migration;
}
async function doMigrateHermes(): Promise<void> {
  const legacy = (await store.read()).find((p) => p.id === HERMES_ID);
  if (!legacy) return;
  const conn = await getHermesConnection();
  await saveHermesConnection({
    ...conn,
    // The legacy provider's stored values are authoritative for chat — they're
    // what was actually used, vs. the env-seeded connection defaults.
    chatBaseUrl: legacy.baseUrl || conn.chatBaseUrl,
    chatKey: legacy.apiKey || conn.chatKey,
  });
  await store.update((all) => all.filter((p) => p.id !== HERMES_ID));
}

/** Synthesize the Hermes (Gateway) chat provider, or undefined if unconfigured. */
async function synthGatewayProvider(): Promise<Provider | undefined> {
  const conn = await getHermesConnection();
  if (!conn.chatBaseUrl) return undefined;
  return {
    id: HERMES_ID,
    name: "Hermes Agent",
    type: "openai",
    kind: "gateway",
    baseUrl: conn.chatBaseUrl,
    apiKey: conn.chatKey,
    models: [],
    enabled: true,
  };
}

export async function getProviders(): Promise<Provider[]> {
  await ensureHermesMigrated();
  return store.read();
}

export async function getProvider(id: string): Promise<Provider | undefined> {
  await ensureHermesMigrated();
  if (id === HERMES_ID) return synthGatewayProvider();
  const all = await store.read();
  return all.find((p) => p.id === id);
}

/**
 * The browser-facing provider list: stored direct providers plus the synthesized
 * Hermes (Gateway) entry when the Gateway has a chat endpoint configured. The
 * Gateway entry leads the list (priority connection) and carries no secrets.
 */
export async function listPublicProviders(): Promise<PublicProvider[]> {
  await ensureHermesMigrated();
  const stored = (await store.read()).filter((p) => p.id !== HERMES_ID);
  const list = stored.map(toPublic);
  const gateway = await synthGatewayProvider();
  if (gateway) list.unshift(toPublic(gateway));
  return list;
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
    kind: p.kind,
    baseUrl: p.baseUrl,
    models: p.models,
    catalog: p.catalog,
    catalogUpdatedAt: p.catalogUpdatedAt,
    defaultModel: p.defaultModel,
    enabled: p.enabled,
    hasKey: Boolean(p.apiKey),
  };
}

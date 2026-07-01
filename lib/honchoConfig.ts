// Server-side helper to read the Honcho config file.
//
// Used by both the catch-all proxy and the /config route. Caches the parsed
// result for the lifetime of the process — honcho.json only changes when the
// operator runs `hermes honcho setup` and restarts, so per-request disk reads
// are pure waste. If a route ever needs fresh data, bump `cache.version` or
// call `readHonchoConfig({ force: true })`.

import "server-only";
import * as fs from "fs";
import * as path from "path";

export interface HonchoRawConfig {
  baseUrl?: string;
  apiKey?: string;
  hosts?: Record<string, Record<string, unknown>>;
  [k: string]: unknown;
}

export interface HonchoHostConfig {
  workspace?: string;
  peerName?: string;
  aiPeer?: string;
  enabled?: boolean;
  recallMode?: string;
  sessionStrategy?: string;
  dialecticReasoningLevel?: string;
  dialecticCadence?: number;
  writeFrequency?: string;
  saveMessages?: boolean;
  observationMode?: string;
  pinUserPeer?: boolean;
  pinPeerName?: boolean;
  userPeerAliases?: Record<string, string>;
  [k: string]: unknown;
}

let cache: { value: HonchoRawConfig; loadedAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

function candidatePaths(): string[] {
  const out: Array<string | null | undefined> = [
    process.env.HERMES_HOME
      ? path.join(process.env.HERMES_HOME, "honcho.json")
      : null,
    process.env.HONCHO_CONFIG,
    path.join(process.env.HOME || "/root", ".hermes", "honcho.json"),
    path.join(process.env.HOME || "/root", ".honcho", "config.json"),
  ];
  return out.filter((p): p is string => typeof p === "string" && p.length > 0);
}

export function readHonchoConfig(
  opts: { force?: boolean } = {},
): HonchoRawConfig {
  if (!opts.force && cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.value;
  }
  for (const p of candidatePaths()) {
    try {
      const raw = fs.readFileSync(p, "utf-8");
      const parsed = JSON.parse(raw) as HonchoRawConfig;
      cache = { value: parsed, loadedAt: Date.now() };
      return parsed;
    } catch {
      // file missing or malformed JSON — try next candidate
    }
  }
  cache = { value: {}, loadedAt: Date.now() };
  return cache.value;
}

/** The "primary" host block, by convention the first key (typically "hermes"). */
export function primaryHost(raw: HonchoRawConfig): {
  key: string;
  config: HonchoHostConfig;
} {
  const hosts = raw.hosts || {};
  const keys = Object.keys(hosts);
  const key = keys[0] || "hermes";
  return { key, config: (hosts[key] as HonchoHostConfig) || {} };
}

/**
 * Public view of the Honcho connection — no secrets, suitable for the
 * browser dashboard. Mirrors the shape in `lib/honchoClient.ts`.
 */
export interface PublicHonchoConfig {
  baseUrl: string;
  workspace: string;
  peerName: string;
  aiPeer: string;
  enabled: boolean;
  hasApiKey: boolean;
  recallMode: string;
  sessionStrategy: string;
  dialecticReasoningLevel: string;
  dialecticCadence: number;
  writeFrequency: string;
  saveMessages: boolean;
  observationMode: string;
  hosts: string[];
}

export function toPublicConfig(raw: HonchoRawConfig): PublicHonchoConfig {
  const { key: activeHostKey, config: host } = primaryHost(raw);
  return {
    baseUrl: raw.baseUrl || "http://localhost:8000",
    workspace: host.workspace || activeHostKey,
    peerName: host.peerName || "",
    aiPeer: host.aiPeer || "",
    enabled: host.enabled ?? true,
    hasApiKey: !!raw.apiKey,
    recallMode: host.recallMode || "hybrid",
    sessionStrategy: host.sessionStrategy || "per-session",
    dialecticReasoningLevel: host.dialecticReasoningLevel || "low",
    dialecticCadence: host.dialecticCadence ?? 2,
    writeFrequency: host.writeFrequency || "async",
    saveMessages: host.saveMessages ?? true,
    observationMode: host.observationMode || "directional",
    hosts: Object.keys(raw.hosts || {}),
  };
}

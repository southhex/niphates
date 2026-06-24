// Connector resources — external tools, vaults, and services the app (and its
// agents) can pipe to. Each connector has a type-specific config validated at
// write time. Persisted under data/connectors.json via the atomic store.
//
// Server-only: never import into a client component.

import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createJsonStore } from "./jsonStore";

// --- Types -----------------------------------------------------------------

export type ConnectorType = "obsidian-vault";

export interface ObsidianVaultConfig {
  /** Absolute path to the vault root directory. */
  path: string;
}

export type ConnectorConfig = ObsidianVaultConfig;

export interface Connector {
  /** Stable slug, e.g. "main-vault". */
  id: string;
  /** Human label shown in the UI. */
  label: string;
  type: ConnectorType;
  config: ConnectorConfig;
  createdAt: number;
  updatedAt: number;
}

/** Public view safe to send to the browser (no secrets in these configs today). */
export type PublicConnector = Connector;

// --- Validation ------------------------------------------------------------

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate a connector's config based on its type. Returns an array of
 * validation errors (empty = valid). `basePath` is the file-system root we
 * resolve relative paths against (defaults to process.cwd()).
 */
export async function validateConnector(
  type: ConnectorType,
  config: Record<string, unknown>,
  basePath?: string,
): Promise<ValidationError[]> {
  const root = basePath || process.cwd();
  if (type === "obsidian-vault") {
    const errors: ValidationError[] = [];
    const rawPath = config.path;
    if (typeof rawPath !== "string" || !rawPath.trim()) {
      errors.push({ field: "path", message: "Vault path is required." });
      return errors;
    }
    const resolved = path.isAbsolute(rawPath) ? rawPath : path.resolve(root, rawPath);
    try {
      const stat = await fs.stat(resolved);
      if (!stat.isDirectory()) {
        errors.push({ field: "path", message: "Path exists but is not a directory." });
        return errors;
      }
    } catch {
      errors.push({ field: "path", message: `Directory does not exist: ${resolved}` });
      return errors;
    }
    try {
      await fs.stat(path.join(resolved, ".obsidian"));
    } catch {
      errors.push({
        field: "path",
        message: "Directory does not contain a .obsidian subfolder — not a valid Obsidian vault.",
      });
    }
    return errors;
  }
  return [];
}

// --- Store -----------------------------------------------------------------

const store = createJsonStore<Connector[]>({
  filename: "connectors.json",
  seed: () => [],
});

/** List all connectors. */
export async function listConnectors(): Promise<Connector[]> {
  return store.read();
}

/** Add a connector (appends). The caller must validate before calling. */
export async function addConnector(conn: Connector): Promise<Connector[]> {
  return store.update((list) => [...list, conn]);
}

/** Replace a connector by id. */
export async function updateConnector(
  id: string,
  patch: Partial<Pick<Connector, "label" | "config">>,
): Promise<Connector[]> {
  return store.update((list) =>
    list.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c)),
  );
}

/** Remove a connector by id. */
export async function removeConnector(id: string): Promise<Connector[]> {
  return store.update((list) => list.filter((c) => c.id !== id));
}

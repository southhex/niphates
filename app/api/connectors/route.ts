// CRUD for connector resources. GET lists, POST adds, PUT updates by id,
// DELETE removes by id. All routes validate connector config server-side.
//
// Path validation for obsidian-vault checks the local filesystem — this is
// intentional: the server needs to be able to read/write the vault, so it must
// be reachable from the server's filesystem.

import { NextRequest } from "next/server";
import {
  listConnectors,
  addConnector,
  updateConnector,
  removeConnector,
  validateConnector,
  type Connector,
  type ObsidianVaultConfig,
} from "@/lib/resourceConnectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// --- Schema (no zod dependency here -- simple shape check is enough) --------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function formatErrors(errors: { field: string; message: string }[]): string {
  return errors.map((e) => `${e.field}: ${e.message}`).join("; ");
}

// --- GET /api/connectors ----------------------------------------------

export async function GET() {
  const connectors = await listConnectors();
  return Response.json({ connectors });
}

// --- POST /api/connectors ---------------------------------------------

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isRecord(raw)) {
    return Response.json({ error: "Expected a JSON object" }, { status: 400 });
  }

  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  const type = raw.type;
  const config = raw.config;

  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  if (!label) return Response.json({ error: "label is required" }, { status: 400 });
  if (type !== "obsidian-vault") {
    return Response.json({ error: `Unknown connector type: ${type}` }, { status: 400 });
  }
  if (!isRecord(config)) {
    return Response.json({ error: "config must be an object" }, { status: 400 });
  }

  // Validate config against the filesystem.
  const errors = await validateConnector(type, config);
  if (errors.length > 0) {
    return Response.json({ error: formatErrors(errors) }, { status: 400 });
  }

  // Enforce unique ids.
  const existing = await listConnectors();
  if (existing.some((c) => c.id === id)) {
    return Response.json(
      { error: `A connector with id "${id}" already exists.` },
      { status: 409 },
    );
  }

  const now = Date.now();
  const vaultConfig: ObsidianVaultConfig = { path: String(config.path ?? "") };
  const conn: Connector = {
    id,
    label,
    type,
    config: vaultConfig,
    createdAt: now,
    updatedAt: now,
  };

  const next = await addConnector(conn);
  return Response.json({ connector: conn, connectors: next }, { status: 201 });
}

// --- PUT /api/connectors?id=<id> --------------------------------------

export async function PUT(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id query param required" }, { status: 400 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isRecord(raw)) {
    return Response.json({ error: "Expected a JSON object" }, { status: 400 });
  }

  const existing = await listConnectors();
  const found = existing.find((c) => c.id === id);
  if (!found) {
    return Response.json({ error: `Connector "${id}" not found.` }, { status: 404 });
  }

  const label =
    typeof raw.label === "string" && raw.label.trim()
      ? raw.label.trim()
      : undefined;
  const config = isRecord(raw.config) ? raw.config : undefined;

  // If config is being updated, validate the merged result.
  if (config) {
    const merged = { ...found.config, ...config };
    const errors = await validateConnector(found.type, merged);
    if (errors.length > 0) {
      return Response.json({ error: formatErrors(errors) }, { status: 400 });
    }
  }

  const next = await updateConnector(id, {
    ...(label ? { label } : {}),
    ...(config ? { config: { path: String(config.path ?? "") } as ObsidianVaultConfig } : {}),
  });
  const updated = next.find((c) => c.id === id)!;
  return Response.json({ connector: updated, connectors: next });
}

// --- DELETE /api/connectors?id=<id> -----------------------------------

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id query param required" }, { status: 400 });

  const existing = await listConnectors();
  if (!existing.some((c) => c.id === id)) {
    return Response.json({ error: `Connector "${id}" not found.` }, { status: 404 });
  }

  const next = await removeConnector(id);
  return Response.json({ connectors: next });
}

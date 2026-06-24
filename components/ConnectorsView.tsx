// components/ConnectorsView.tsx
// Resource directory for external tools and services the app (and its agents)
// can pipe to. Currently supports Obsidian vaults; more connector types to
// follow (MCP servers, TTRPG tools, local agents, etc.).
"use client";

import { useEffect, useState } from "react";

interface ObsidianVaultConfig {
  path: string;
}

interface Connector {
  id: string;
  label: string;
  type: string;
  config: ObsidianVaultConfig;
  createdAt: number;
  updatedAt: number;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const API = "/api/connectors";

export function ConnectorsView() {
  const [connectors, setConnectors] = useState<Connector[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Add form state
  const [newId, setNewId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newPath, setNewPath] = useState("");
  const [newType, setNewType] = useState("obsidian-vault");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(API);
      const data = (await res.json()) as { connectors?: Connector[] };
      setConnectors(data.connectors ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm(`Delete connector "${id}"?`)) return;
    setError("");
    try {
      const res = await fetch(`${API}?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error || `HTTP ${res.status}`);
        return;
      }
      setConnectors((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError("");
    setAdding(true);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: newId.trim(),
          label: newLabel.trim(),
          type: newType,
          config: { path: newPath.trim() },
        }),
      });
      const data = (await res.json()) as { connectors?: Connector[]; error?: string };
      if (!res.ok) {
        setAddError(data.error || `HTTP ${res.status}`);
        return;
      }
      setConnectors(data.connectors ?? []);
      setNewId("");
      setNewLabel("");
      setNewPath("");
      setNewType("obsidian-vault");
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="border border-hair bg-paneldk p-6 font-mono text-[12px] text-mutedlo">
        Loading connectors…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border border-hair bg-paneldk p-4">
        <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
          ⌁ CONNECTORS
        </div>
        <p className="font-mono text-[12px] text-parch">
          Wire up external tools and services for the app and its agents to use.
          Currently supports Obsidian vaults — more connector types coming.
        </p>
      </div>

      {error && (
        <div className="border border-hair bg-panel px-3 py-2 font-mono text-[13px] text-carnelian">
          {error}
        </div>
      )}

      {/* Existing connectors */}
      {connectors && connectors.length > 0 && (
        <div className="border border-hair bg-paneldk">
          <div className="border-b border-hair px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
            ⌁ REGISTERED · {connectors.length}
          </div>
          <ul className="divide-y divide-hair">
            {connectors.map((c) => (
              <li
                key={c.id}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-panel"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[13px] text-marble">
                      {c.label || c.id}
                    </span>
                    <span className="border border-hair px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-muted">
                      {c.type}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-mutedlo">
                    {c.config.path}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-mutedlo">
                    created {formatTime(c.createdAt)}
                    {c.updatedAt !== c.createdAt
                      ? ` · updated ${formatTime(c.updatedAt)}`
                      : ""}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(c.id)}
                  className="mt-1 shrink-0 border border-hair px-2 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-carnelian opacity-60 transition hover:border-carnelian hover:opacity-100"
                >
                  DELETE
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Add new connector */}
      <form onSubmit={handleAdd} className="border border-hair bg-paneldk p-4">
        <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
          ⌁ ADD CONNECTOR
        </div>

        {addError && (
          <div className="mb-3 border border-hair bg-panel px-3 py-2 font-mono text-[12px] text-carnelian">
            {addError}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.15em] text-mutedlo">
              ID
            </div>
            <input
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="main-vault"
              required
              className="w-full border border-hair bg-panel px-3 py-2 font-mono text-[12px] text-marble outline-none focus:border-gold"
            />
          </label>

          <label className="block">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.15em] text-mutedlo">
              Label
            </div>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="My Obsidian Vault"
              required
              className="w-full border border-hair bg-panel px-3 py-2 font-mono text-[12px] text-marble outline-none focus:border-gold"
            />
          </label>

          <label className="block">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.15em] text-mutedlo">
              Type
            </div>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="w-full border border-hair bg-panel px-3 py-2 font-mono text-[12px] text-marble outline-none focus:border-gold"
            >
              <option value="obsidian-vault">Obsidian Vault</option>
            </select>
          </label>

          {newType === "obsidian-vault" && (
            <label className="block">
              <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.15em] text-mutedlo">
                Vault Path
                <span className="ml-1 font-mono text-[9px] normal-case tracking-normal text-muted">
                  (absolute path on the server filesystem, must contain .obsidian)
                </span>
              </div>
              <input
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder="/root/workspace/obsidian/Main Vault"
                required
                className="w-full border border-hair bg-panel px-3 py-2 font-mono text-[12px] text-marble outline-none focus:border-gold"
              />
            </label>
          )}
        </div>

        <button
          type="submit"
          disabled={adding}
          className="mt-3 border border-hair bg-panel px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-marble transition hover:border-gold hover:text-gold disabled:opacity-40"
        >
          {adding ? "REGISTERING…" : "REGISTER CONNECTOR"}
        </button>
      </form>
    </div>
  );
}

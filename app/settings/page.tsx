"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProviderType, PublicProvider } from "@/lib/types";

interface FormState {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  apiKey: string;
  models: string;
  defaultModel: string;
  enabled: boolean;
}

const BLANK: FormState = {
  id: "",
  name: "",
  type: "openai",
  baseUrl: "",
  apiKey: "",
  models: "",
  defaultModel: "",
  enabled: true,
};

export default function SettingsPage() {
  const [providers, setProviders] = useState<PublicProvider[]>([]);
  const [form, setForm] = useState<FormState>(BLANK);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<string>("");

  const refresh = () =>
    fetch("/api/providers")
      .then((r) => r.json())
      .then((d) => setProviders(d.providers));

  useEffect(() => {
    refresh();
  }, []);

  const startEdit = (p: PublicProvider) => {
    setEditing(true);
    setForm({
      id: p.id,
      name: p.name,
      type: p.type,
      baseUrl: p.baseUrl,
      apiKey: "",
      models: p.models.join(", "),
      defaultModel: p.defaultModel || "",
      enabled: p.enabled !== false,
    });
    setStatus("");
  };

  const startNew = () => {
    setEditing(true);
    setForm(BLANK);
    setStatus("");
  };

  const save = async () => {
    const payload = {
      id: form.id.trim(),
      name: form.name.trim(),
      type: form.type,
      baseUrl: form.baseUrl.trim(),
      apiKey: form.apiKey,
      models: form.models
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
      defaultModel: form.defaultModel.trim() || undefined,
      enabled: form.enabled,
    };
    if (!payload.id || !payload.name || !payload.baseUrl) {
      setStatus("id, name and baseUrl are required.");
      return;
    }
    const res = await fetch("/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const d = await res.json();
      setProviders(d.providers);
      setEditing(false);
      setForm(BLANK);
      setStatus("Saved.");
    } else {
      const d = await res.json().catch(() => ({}));
      setStatus(d.error || "Save failed.");
    }
  };

  const remove = async (id: string) => {
    if (!confirm(`Delete provider "${id}"?`)) return;
    const res = await fetch(`/api/providers?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      const d = await res.json();
      setProviders(d.providers);
    }
  };

  const test = async (id: string) => {
    setStatus(`Testing ${id}…`);
    const res = await fetch("/api/providers/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId: id }),
    });
    const d = await res.json();
    if (d.ok) {
      setStatus(
        d.models?.length
          ? `✅ ${id} reachable. Models: ${d.models.slice(0, 8).join(", ")}${
              d.models.length > 8 ? "…" : ""
            }`
          : `✅ ${id} reachable. ${d.note || ""}`,
      );
    } else {
      setStatus(`❌ ${id}: ${d.error}`);
    }
  };

  return (
    <div className="min-h-screen bg-ground">
      {/* Command bar */}
      <div className="flex items-center justify-between border-b border-gold px-6 py-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-gold">
          NIPHATES // SETTINGS
        </span>
        <Link
          href="/"
          className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted hover:text-gold"
        >
          ← RETURN
        </Link>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Title */}
        <div className="mb-8 flex items-center gap-3">
          <span className="font-display text-[20px] text-gold">§</span>
          <h1 className="font-display text-[32px] font-semibold uppercase tracking-[0.08em] text-marble">
            Providers
          </h1>
        </div>

        {/* Status message */}
        {status && (
          <div className="mb-4 break-words border border-hair bg-panel px-3 py-2 font-mono text-[13px] text-parch">
            {status}
          </div>
        )}

        {/* Provider rows */}
        <div className="border border-hair divide-y divide-hair">
          {providers.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center gap-2 bg-ground px-4 py-3 hover:bg-panel"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="status-dot status-dot-malach" />
                  <span className="font-mono text-[13px] font-medium text-marble">
                    {p.name}
                  </span>
                  <span className="border border-hair px-1.5 py-0.5 font-mono text-[10px] text-muted">
                    {p.type}
                  </span>
                  {p.enabled === false && (
                    <span className="border border-hair px-1.5 py-0.5 font-mono text-[10px] text-mutedlo">
                      disabled
                    </span>
                  )}
                  {!p.hasKey && p.type !== "openai" && (
                    <span className="border border-carnelian px-1.5 py-0.5 font-mono text-[10px] text-carnelian">
                      no key
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
                  {p.baseUrl}
                </div>
                <div className="truncate font-mono text-[11px] text-gold">
                  {p.models.join(", ") || "no models"}
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => test(p.id)}
                  className="border border-hair px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-parch hover:border-malach hover:text-malach"
                >
                  TEST
                </button>
                <button
                  onClick={() => startEdit(p)}
                  className="border border-hair px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-parch hover:border-lapis hover:text-lapis"
                >
                  EDIT
                </button>
                <button
                  onClick={() => remove(p.id)}
                  className="border border-hair px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-carnelian hover:bg-carnelian/10"
                >
                  DELETE
                </button>
              </div>
            </div>
          ))}
        </div>

        {!editing ? (
          <button
            onClick={startNew}
            className="btn-ghost-gold mt-4 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em]"
          >
            ❯ ADD PROVIDER
          </button>
        ) : (
          <div className="mt-6 space-y-3 border border-hair bg-panel p-4">
            <h2 className="font-mono text-[12px] uppercase tracking-[0.18em] text-muted">
              {form.id ? "Edit" : "New"} Provider
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="ID (slug)">
                <input
                  className="inp"
                  value={form.id}
                  onChange={(e) => setForm({ ...form, id: e.target.value })}
                  placeholder="openrouter"
                />
              </Field>
              <Field label="Name">
                <input
                  className="inp"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="OpenRouter"
                />
              </Field>
              <Field label="Type">
                <select
                  className="inp"
                  value={form.type}
                  onChange={(e) =>
                    setForm({ ...form, type: e.target.value as ProviderType })
                  }
                >
                  <option value="openai">openai (compatible)</option>
                  <option value="anthropic">anthropic</option>
                </select>
              </Field>
              <Field label="Base URL">
                <input
                  className="inp"
                  value={form.baseUrl}
                  onChange={(e) =>
                    setForm({ ...form, baseUrl: e.target.value })
                  }
                  placeholder="https://openrouter.ai/api/v1"
                />
              </Field>
              <Field label="API key (blank = keep existing)">
                <input
                  className="inp"
                  type="password"
                  value={form.apiKey}
                  onChange={(e) =>
                    setForm({ ...form, apiKey: e.target.value })
                  }
                  placeholder="sk-…"
                />
              </Field>
              <Field label="Default model (optional)">
                <input
                  className="inp"
                  value={form.defaultModel}
                  onChange={(e) =>
                    setForm({ ...form, defaultModel: e.target.value })
                  }
                  placeholder="hermes-agent"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Models (comma-separated)">
                  <input
                    className="inp"
                    value={form.models}
                    onChange={(e) =>
                      setForm({ ...form, models: e.target.value })
                    }
                    placeholder="hermes-agent, gpt-4o-mini"
                  />
                </Field>
              </div>
              <label className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.1em] text-muted">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) =>
                    setForm({ ...form, enabled: e.target.checked })
                  }
                  className="accent-gold"
                />
                Enabled
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={save}
                className="btn-gold px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em]"
              >
                SAVE
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setForm(BLANK);
                }}
                className="border border-hair px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-parch hover:border-hairlit hover:text-marble"
              >
                CANCEL
              </button>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        :global(.inp) {
          width: 100%;
          background: var(--void);
          border: 1px solid var(--hairlit);
          padding: 0.5rem 0.75rem;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 0.8125rem;
          color: var(--marble);
          outline: none;
        }
        :global(.inp:focus) {
          border-color: var(--gold);
          box-shadow: 0 0 0 1px var(--gold), 0 0 18px rgba(201, 162, 75, 0.18);
        }
        :global(.inp::placeholder) {
          color: var(--mutedlo);
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

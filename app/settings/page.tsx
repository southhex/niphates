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
      apiKey: "", // never prefilled; leave blank to keep existing key
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
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Providers</h1>
        <Link href="/" className="text-sm text-amber-400 hover:underline">
          ← Back to chat
        </Link>
      </div>

      {status && (
        <div className="mb-4 break-words rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300">
          {status}
        </div>
      )}

      <div className="space-y-3">
        {providers.map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{p.name}</span>
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-400">
                  {p.type}
                </span>
                {p.enabled === false && (
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-500">
                    disabled
                  </span>
                )}
                {!p.hasKey && p.type !== "openai" && (
                  <span className="rounded bg-red-900/50 px-1.5 py-0.5 text-xs text-red-300">
                    no key
                  </span>
                )}
              </div>
              <div className="truncate text-xs text-slate-500">{p.baseUrl}</div>
              <div className="truncate text-xs text-slate-500">
                {p.models.join(", ") || "no models"}
              </div>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => test(p.id)}
                className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs hover:bg-slate-800"
              >
                Test
              </button>
              <button
                onClick={() => startEdit(p)}
                className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs hover:bg-slate-800"
              >
                Edit
              </button>
              <button
                onClick={() => remove(p.id)}
                className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-red-300 hover:bg-slate-800"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {!editing ? (
        <button
          onClick={startNew}
          className="mt-4 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
        >
          + Add provider
        </button>
      ) : (
        <div className="mt-6 space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="font-medium">{form.id ? "Edit" : "New"} provider</h2>
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
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                placeholder="https://openrouter.ai/api/v1"
              />
            </Field>
            <Field label="API key (blank = keep existing)">
              <input
                className="inp"
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
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
                  onChange={(e) => setForm({ ...form, models: e.target.value })}
                  placeholder="hermes-agent, gpt-4o-mini"
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) =>
                  setForm({ ...form, enabled: e.target.checked })
                }
              />
              Enabled
            </label>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={save}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
            >
              Save
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setForm(BLANK);
              }}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        :global(.inp) {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid #334155;
          background: #0f172a;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          outline: none;
        }
        :global(.inp:focus) {
          border-color: #f59e0b;
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
    <label className="block text-sm">
      <span className="mb-1 block text-slate-400">{label}</span>
      {children}
    </label>
  );
}

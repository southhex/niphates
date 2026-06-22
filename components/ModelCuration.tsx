// components/ModelCuration.tsx
"use client";

import { useEffect, useState } from "react";
import type { PublicProvider } from "@/lib/types";

function relTime(ts?: number): string {
  if (!ts) return "never";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function ModelCuration() {
  const [providers, setProviders] = useState<PublicProvider[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [manual, setManual] = useState<Record<string, string>>({});

  const load = () =>
    fetch("/api/providers")
      .then((r) => r.json())
      .then((d) =>
        // The Hermes (Gateway) entry's "models" are profiles, switched from the
        // composer — it isn't curated here.
        setProviders(
          (d.providers as PublicProvider[]).filter((p) => p.kind !== "gateway"),
        ),
      );

  useEffect(() => {
    load();
  }, []);

  const discover = async (id: string) => {
    setBusy(id);
    setNote("");
    const res = await fetch("/api/providers/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId: id }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setNote(`❌ ${d.error || "discover failed"}`);
      return;
    }
    if (d.catalog === null) setNote(d.note || "No discovery for this provider.");
    await load();
  };

  // Persist the enabled set, ordered by the catalog where possible so the saved
  // list is stable; manually-added ids (not in the catalog) are appended.
  const saveModels = async (p: PublicProvider, enabled: Set<string>) => {
    const catalog = p.catalog ?? [];
    const fromCatalog = catalog.filter((m) => enabled.has(m));
    const extras = [...enabled].filter((m) => !catalog.includes(m));
    const models = [...fromCatalog, ...extras];
    setProviders((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, models } : x)),
    );
    const res = await fetch(`/api/providers/${encodeURIComponent(p.id)}/models`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ models }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setNote(`❌ Failed to save model selection for ${p.name} — reverted.`);
      await load();
    }
  };

  const toggle = (p: PublicProvider, model: string) => {
    const enabled = new Set(p.models);
    if (enabled.has(model)) enabled.delete(model);
    else enabled.add(model);
    void saveModels(p, enabled);
  };

  // Manually add a model id — for providers without a discovery endpoint
  // (e.g. Anthropic), or to pin one that isn't in the served catalog.
  const addManual = (p: PublicProvider) => {
    const id = (manual[p.id] ?? "").trim();
    if (!id) return;
    setManual((m) => ({ ...m, [p.id]: "" }));
    void saveModels(p, new Set([...p.models, id]));
  };

  return (
    <section className="mb-4 border border-hair bg-paneldk p-4">
      <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
        ⌁ MODELS
      </div>
      <p className="mb-4 font-mono text-[12px] text-parch">
        Choose which models appear in the composer picker. Discover pulls the
        full list a provider serves; toggle the ones you want.
      </p>
      {note && (
        <div className="mb-3 break-words border border-hair bg-panel px-3 py-2 font-mono text-[12px] text-parch">
          {note}
        </div>
      )}
      <div className="space-y-5">
        {providers.map((p) => {
          const enabled = new Set(p.models);
          const catalog = p.catalog ?? [];
          // Render the catalog plus any enabled ids not in it (manual entries).
          const rows = [
            ...catalog,
            ...p.models.filter((m) => !catalog.includes(m)),
          ];
          return (
            <div key={p.id}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[13px] text-marble">
                  {p.name}
                </span>
                <span className="font-mono text-[11px] text-muted">
                  ({p.models.length} of {rows.length} enabled)
                </span>
                <span className="font-mono text-[11px] text-mutedlo">
                  · discovered {relTime(p.catalogUpdatedAt)}
                </span>
                {p.type !== "anthropic" && (
                  <button
                    onClick={() => discover(p.id)}
                    disabled={busy === p.id}
                    className="ml-auto border border-hair px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-parch hover:border-lapis hover:text-lapis disabled:opacity-40"
                  >
                    {busy === p.id ? "…" : "DISCOVER"}
                  </button>
                )}
              </div>
              {rows.length > 0 && (
                <div className="mb-2 flex flex-col gap-1">
                  {rows.map((m) => (
                    <label
                      key={m}
                      className="flex cursor-pointer items-center gap-2 font-mono text-[12px]"
                    >
                      <input
                        type="checkbox"
                        checked={enabled.has(m)}
                        onChange={() => toggle(p, m)}
                        className="accent-gold"
                      />
                      <span className={enabled.has(m) ? "text-marble" : "text-muted"}>
                        {m}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {rows.length === 0 && (
                <p className="mb-2 font-mono text-[11px] text-mutedlo">
                  {p.type === "anthropic"
                    ? "Anthropic has no model-list endpoint — add model ids below."
                    : "Discover to populate the catalog, or add ids below."}
                </p>
              )}
              {/* Manual add — for providers without discovery (Anthropic) or to
                  pin a model not in the served catalog. */}
              <div className="flex gap-2">
                <input
                  className="min-w-0 flex-1 border border-hairlit bg-void px-2 py-1 font-mono text-[12px] text-marble outline-none placeholder:text-mutedlo focus:border-gold"
                  value={manual[p.id] ?? ""}
                  onChange={(e) =>
                    setManual((m) => ({ ...m, [p.id]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addManual(p);
                  }}
                  placeholder="add model id…"
                />
                <button
                  onClick={() => addManual(p)}
                  className="border border-hair px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-parch hover:border-gold hover:text-gold"
                >
                  ADD
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

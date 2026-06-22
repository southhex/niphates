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

  const load = () =>
    fetch("/api/providers")
      .then((r) => r.json())
      .then((d) => setProviders(d.providers as PublicProvider[]));

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

  const toggle = async (p: PublicProvider, model: string) => {
    const enabled = new Set(p.models);
    if (enabled.has(model)) enabled.delete(model);
    else enabled.add(model);
    const models = (p.catalog ?? []).filter((m) => enabled.has(m));
    setProviders((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, models } : x)),
    );
    await fetch(`/api/providers/${encodeURIComponent(p.id)}/models`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ models }),
    });
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
          return (
            <div key={p.id}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[13px] text-marble">
                  {p.name}
                </span>
                <span className="font-mono text-[11px] text-muted">
                  ({p.models.length} of {catalog.length} enabled)
                </span>
                <span className="font-mono text-[11px] text-mutedlo">
                  · discovered {relTime(p.catalogUpdatedAt)}
                </span>
                <button
                  onClick={() => discover(p.id)}
                  disabled={busy === p.id}
                  className="ml-auto border border-hair px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-parch hover:border-lapis hover:text-lapis disabled:opacity-40"
                >
                  {busy === p.id ? "…" : "DISCOVER"}
                </button>
              </div>
              {catalog.length === 0 ? (
                <p className="font-mono text-[11px] text-mutedlo">
                  {p.type === "anthropic"
                    ? "No model-list endpoint — edit models in Settings."
                    : "Discover to populate the catalog."}
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {catalog.map((m) => (
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
            </div>
          );
        })}
      </div>
    </section>
  );
}

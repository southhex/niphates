// components/HermesModelCatalog.tsx
"use client";

import { useMemo, useState } from "react";
import type { ModelOptions } from "@/lib/hermesClient";

export function HermesModelCatalog({
  options,
  currentModel,
  busyModel,
  onSet,
}: {
  options: ModelOptions | null;
  currentModel: string | null;
  busyModel: string | null;
  onSet: (model: string, provider: string) => void;
}) {
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const ups = (options?.providers ?? []).filter((u) => u.total_models > 0);
    const needle = q.trim().toLowerCase();
    return ups
      .map((u) => ({
        ...u,
        shown: u.models.filter(
          (m) => !needle || m.toLowerCase().includes(needle),
        ),
      }))
      .filter((u) => u.shown.length > 0);
  }, [options, q]);

  if (!options?.providers?.length) {
    return (
      <p className="font-mono text-[12px] text-mutedlo">
        No catalog — connect with a session token to load available models.
      </p>
    );
  }

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="search models…"
        className="hxinp mb-3"
      />
      <div className="max-h-[420px] space-y-4 overflow-y-auto">
        {groups.map((u) => {
          const unavailable = new Set(u.unavailable_models);
          return (
            <div key={u.slug}>
              <div className="mb-1.5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                {u.name}
                {u.is_current && <span className="text-malach">· current</span>}
                <span className="text-mutedlo">{u.shown.length}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                {u.shown.map((m) => {
                  const off = unavailable.has(m);
                  const active = m === currentModel;
                  const price = u.pricing?.[m];
                  return (
                    <button
                      key={m}
                      type="button"
                      disabled={off || active || busyModel === m}
                      onClick={() => onSet(m, u.slug)}
                      className={`flex items-center justify-between gap-3 px-2 py-1.5 text-left font-mono text-[12px] ${
                        active
                          ? "bg-panel text-gold"
                          : off
                            ? "text-mutedlo line-through"
                            : "text-parch hover:bg-panel hover:text-marble"
                      } disabled:cursor-not-allowed`}
                    >
                      <span className="truncate">{m}</span>
                      <span className="shrink-0 text-[10.5px] text-muted">
                        {busyModel === m
                          ? "…"
                          : price?.input && price?.output
                            ? `${price.input}/${price.output}`
                            : off
                              ? "n/a"
                              : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

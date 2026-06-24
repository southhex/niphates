"use client";

// components/HermesModelFilter.tsx
// Curate which gateway models appear in the composer model picker, per-provider.
// The saved map lives in the Gateway connection (data/hermes.json → allowedModels):
// key = provider slug, value = list of allowed model ids for that provider.
// Empty map/undefined means "no filter — show all".

import { useEffect, useMemo, useState } from "react";
import type { ModelOptions } from "@/lib/hermesClient";

type AllowedMap = Record<string, string[]>;

export function HermesModelFilter({
  options,
  allowed,
  saving,
  onSave,
}: {
  options: ModelOptions | null;
  allowed: AllowedMap | undefined;
  saving?: boolean;
  onSave: (models: AllowedMap) => void;
}) {
  const [q, setQ] = useState("");
  // Set of "provider::model" keys for O(1) lookup.
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);

  const groups = useMemo(
    () => (options?.providers ?? []).filter((u) => u.total_models > 0),
    [options],
  );

  // Total unique (provider, model) pairs — used for "all" detection.
  const totalPairs = useMemo(
    () => groups.reduce((n, u) => n + u.models.length, 0),
    [groups],
  );

  // (Re)sync local selection when the catalog loads or the saved map changes.
  useEffect(() => {
    if (!options) return;
    const next = new Set<string>();
    if (allowed) {
      for (const [slug, models] of Object.entries(allowed)) {
        if (models.length === 0) continue;
        for (const m of models) next.add(`${slug}::${m}`);
      }
    } else {
      // No filter = everything allowed.
      for (const u of groups) for (const m of u.models) next.add(`${u.slug}::${m}`);
    }
    setSel(next);
    setDirty(false);
  }, [options, allowed, groups]);

  const mutate = (fn: (s: Set<string>) => void) =>
    setSel((prev) => {
      const next = new Set(prev);
      fn(next);
      setDirty(true);
      return next;
    });

  const toggle = (slug: string, model: string) =>
    mutate((s) => {
      const key = `${slug}::${model}`;
      s.has(key) ? s.delete(key) : s.add(key);
    });

  const setProviderModels = (slug: string, models: string[], on: boolean) =>
    mutate((s) => models.forEach((m) => (on ? s.add(`${slug}::${m}`) : s.delete(`${slug}::${m}`))));

  const save = () => {
    // If everything is selected, persist {} to mean "no filter".
    if (totalPairs > 0 && sel.size === totalPairs) {
      onSave({});
      return;
    }
    const map: AllowedMap = {};
    for (const key of sel) {
      const [slug, ...rest] = key.split("::");
      const model = rest.join("::"); // model ids can contain ::
      if (!map[slug]) map[slug] = [];
      map[slug].push(model);
    }
    onSave(map);
  };

  if (!options?.providers?.length) {
    return (
      <p className="font-mono text-[12px] text-mutedlo">
        No catalog — connect with a session token to load available models.
      </p>
    );
  }

  const needle = q.trim().toLowerCase();
  const allOn = totalPairs > 0 && sel.size === totalPairs;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] text-muted">
          {sel.size} of {totalPairs} shown in composer
        </span>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => {
              mutate((s) => {
                groups.forEach((u) => {
                  u.models.forEach((m) => s.add(`${u.slug}::${m}`));
                });
              });
            }}
            disabled={allOn}
            className="border border-hair px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-parch hover:border-lapis hover:text-lapis disabled:opacity-40"
          >
            ALL
          </button>
          <button
            type="button"
            onClick={() => mutate((s) => s.clear())}
            disabled={sel.size === 0}
            className="border border-hair px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-parch hover:border-lapis hover:text-lapis disabled:opacity-40"
          >
            NONE
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="border border-gold px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-gold hover:bg-[var(--goldsoft)] disabled:opacity-40"
          >
            {saving ? "…" : "SAVE"}
          </button>
        </div>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="search models…"
        className="mb-3 w-full border border-hairlit bg-void px-2.5 py-1.5 font-mono text-[12px] text-marble outline-none placeholder:text-mutedlo focus:border-gold"
      />

      <div className="max-h-[440px] space-y-4 overflow-y-auto">
        {groups.map((u) => {
          const shown = u.models.filter(
            (m) => !needle || m.toLowerCase().includes(needle),
          );
          if (shown.length === 0) return null;
          const on = shown.filter((m) => sel.has(`${u.slug}::${m}`)).length;
          return (
            <div key={u.slug}>
              <div className="mb-1.5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                <span>{u.name}</span>
                {u.is_current && <span className="text-malach">· current</span>}
                <span className="text-mutedlo">
                  {on}/{u.models.length}
                </span>
                <div className="ml-auto flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setProviderModels(u.slug, u.models, true)}
                    className="text-mutedlo hover:text-lapis"
                  >
                    all
                  </button>
                  <span className="text-mutedlo">·</span>
                  <button
                    type="button"
                    onClick={() => setProviderModels(u.slug, u.models, false)}
                    className="text-mutedlo hover:text-lapis"
                  >
                    none
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                {shown.map((m) => (
                  <label
                    key={m}
                    className="flex cursor-pointer items-center justify-between gap-2 px-1 font-mono text-[12px]"
                  >
                    <span className={sel.has(`${u.slug}::${m}`) ? "text-marble" : "text-muted"}>
                      {m}
                    </span>
                    <input
                      type="checkbox"
                      checked={sel.has(`${u.slug}::${m}`)}
                      onChange={() => toggle(u.slug, m)}
                      className="accent-gold"
                    />
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

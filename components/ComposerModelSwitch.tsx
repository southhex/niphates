// components/ComposerModelSwitch.tsx
"use client";

// Quick model switcher for the composer: shows the selected Hermes profile's
// current underlying LLM and lets you change it inline (PUT /profiles/{name}/model
// — global server-side state). Self-contained: loads its own catalog + current
// model so app/page.tsx stays out of the management plane.

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { hermesApi, getConnection, type ModelOptions } from "@/lib/hermesClient";
import { HermesModelCatalog } from "@/components/HermesModelCatalog";

/** Drop the "vendor/" prefix for a compact chip label. */
function shortModel(model: string): string {
  const slash = model.lastIndexOf("/");
  return slash === -1 ? model : model.slice(slash + 1);
}

export function ComposerModelSwitch({ profile }: { profile: string }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ModelOptions | null>(null);
  const [current, setCurrent] = useState<{ model: string; provider: string } | null>(
    null,
  );
  const [busyModel, setBusyModel] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<Record<string, string[]> | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Curated allowlist from Command → Models. Empty/undefined = show all.
  useEffect(() => {
    getConnection().then((c) => setAllowed(c?.allowedModels ?? null));
  }, []);

  // The catalog, narrowed to the per-provider allowlist (when one is set).
  const shownOptions = useMemo<ModelOptions | null>(() => {
    if (!options) return null;
    if (!allowed || Object.keys(allowed).length === 0) return options;
    // When the map is non-empty, filtering is active: only show models from
    // providers that have entries in the map. Providers not in the map get
    // an empty list (hidden). A provider entry with [] also hides all its models.
    const providers = (options.providers ?? [])
      .map((u) => {
        const allowedForProvider = allowed[u.slug];
        if (allowedForProvider === undefined) return { ...u, models: [] };
        const models = u.models.filter((m) => allowedForProvider.includes(m));
        return { ...u, models };
      })
      .filter((u) => u.models.length > 0)
      .map((u) => ({ ...u, total_models: u.models.length }));
    return { ...options, providers };
  }, [options, allowed]);

  // Resolve the selected profile's current model from the profiles list (more
  // accurate than /model/info, which only reflects the *active* profile).
  useEffect(() => {
    let cancelled = false;
    hermesApi.profiles().then((r) => {
      if (cancelled || !r.ok) return;
      const p = r.data?.profiles?.find((x) => x.name === profile);
      if (p?.model) setCurrent({ model: p.model, provider: p.provider ?? "" });
    });
    return () => {
      cancelled = true;
    };
  }, [profile]);

  // Lazy-load the catalog the first time the popover opens.
  useEffect(() => {
    if (!open || options) return;
    hermesApi.modelOptions().then((r) => {
      if (r.ok && r.data) setOptions(r.data);
    });
  }, [open, options]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onSet = async (model: string, provider: string) => {
    setBusyModel(model);
    const r = await hermesApi.setProfileModel(profile, model, provider);
    setBusyModel(null);
    if (r.ok) {
      setCurrent({ model, provider });
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className="relative flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={current ? `${current.model} · ${current.provider}` : "Switch model"}
        className="flex items-center gap-1 bg-panel px-2.5 py-1 font-mono text-[11px] text-gold transition-colors hover:text-goldbri"
      >
        <span className="max-w-[140px] truncate">
          {current ? shortModel(current.model) : "model"}
        </span>
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="absolute bottom-full right-0 z-20 mb-2 w-[340px] border border-hair bg-void p-3 shadow-lg">
          <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.2em] text-mutedlo">
            {profile} · model
          </div>
          <HermesModelCatalog
            options={shownOptions}
            currentModel={current?.model ?? null}
            busyModel={busyModel}
            onSet={onSet}
          />
        </div>
      )}
    </div>
  );
}

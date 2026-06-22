// components/CommandView.tsx
// The Command chamber — Hermes-Agent-only control surface over the management
// API. The Gateway connection itself is configured in Settings → Connections;
// here we drive the agent (models now; sessions, cron, memory, voice, channels
// and keys to follow). Every request is proxied server-side.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HermesModelCatalog } from "@/components/HermesModelCatalog";
import { CHAMBER_SUBSECTIONS } from "@/components/chambers";
import {
  getConnection,
  testConnection,
  hermesApi,
  type PublicHermesConnection,
  type ModelOptions,
} from "@/lib/hermesClient";

export function CommandView({ section }: { section: string }) {
  const [conn, setConn] = useState<PublicHermesConnection | null>(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("");

  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [currentProvider, setCurrentProvider] = useState<string | null>(null);
  const [options, setOptions] = useState<ModelOptions | null>(null);
  const [busyModel, setBusyModel] = useState<string | null>(null);

  const refreshLive = async () => {
    const [info, opts] = await Promise.all([
      hermesApi.modelInfo(),
      hermesApi.modelOptions(),
    ]);
    if (info.ok && info.data) {
      setCurrentModel((info.data.model as string) ?? null);
      setCurrentProvider((info.data.provider as string) ?? null);
    }
    if (opts.ok) setOptions(opts.data);
  };

  // On mount: load the saved Gateway connection and auto-connect when usable
  // (loopback needs no token; otherwise a token must be present) so the model
  // catalog is ready without a manual step.
  useEffect(() => {
    getConnection().then(async (c) => {
      if (!c) return;
      setConn(c);
      if (!(c.isLoopback || c.hasToken)) return;
      setStatus("Connecting to Gateway…");
      const t = await testConnection();
      if (t.ok) {
        setConnected(true);
        setStatus(
          t.authenticated === false
            ? `⚠️ Reachable but NOT authenticated — fix the Gateway token in Settings.`
            : "",
        );
        await refreshLive();
      } else {
        setStatus(`❌ ${t.error || `HTTP ${t.status}`}`);
      }
    });
  }, []);

  const onSetModel = async (model: string, provider: string) => {
    if (!model || model === currentModel) return;
    setBusyModel(model);
    setStatus(`Switching to ${model}…`);
    const res = await hermesApi.setModel(model, provider);
    setBusyModel(null);
    if (res.ok) {
      setStatus(`✅ Active model is now ${model}`);
      await refreshLive();
    } else {
      setStatus(`❌ ${res.error}`);
    }
  };

  const notConfigured = conn !== null && !conn.isLoopback && !conn.hasToken;

  const sectionLabel =
    CHAMBER_SUBSECTIONS.command?.find((s) => s.id === section)?.label ??
    "Command";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 font-display text-[32px] font-semibold tracking-[0.06em] text-marble">
        {sectionLabel}
      </h1>

      {status && (
        <div className="mb-4 break-words border border-hair bg-panel px-3 py-2 font-mono text-[13px] text-parch">
          {status}
        </div>
      )}

      {notConfigured ? (
        <div className="border border-hair bg-paneldk p-4 font-mono text-[12px] text-parch">
          The Gateway isn&apos;t connected. Set the management URL + token in{" "}
          <Link
            href="/settings"
            className="text-gold underline underline-offset-2 hover:text-goldbri"
          >
            Settings → Connections
          </Link>{" "}
          to control Hermes.
        </div>
      ) : section === "models" ? (
        <section className="border border-hair bg-paneldk p-4">
          <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
            ⌁ MODEL
          </div>
          <p className="mb-3 font-mono text-[12px] text-parch">
            Current:{" "}
            <span className="text-gold">{currentModel ?? "unknown"}</span>
            {currentProvider ? (
              <span className="text-muted"> · {currentProvider}</span>
            ) : null}
          </p>
          <p className="mb-3 font-mono text-[11px] text-mutedlo">
            The composer picks which profile answers; here you set the model that
            profile thinks with. This is a global Hermes setting — it changes the
            model for every chat against this profile.
          </p>
          <HermesModelCatalog
            options={options}
            currentModel={currentModel}
            busyModel={busyModel}
            onSet={onSetModel}
          />
          <button
            onClick={refreshLive}
            className="mt-3 border border-hair px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-parch hover:border-lapis hover:text-lapis"
          >
            REFRESH
          </button>
        </section>
      ) : (
        <div className="border border-hair bg-paneldk p-8 text-center font-mono text-[12px] text-mutedlo">
          {CHAMBER_SUBSECTIONS.command?.find((s) => s.id === section)?.label} —
          coming soon.
        </div>
      )}
    </div>
  );
}

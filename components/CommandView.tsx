// components/CommandView.tsx
"use client";

import { useEffect, useState } from "react";
import { ModelCuration } from "@/components/ModelCuration";
import { HermesModelCatalog } from "@/components/HermesModelCatalog";
import {
  getConnection,
  saveConnection,
  testConnection,
  hermesApi,
  type PublicHermesConnection,
  type ModelOptions,
} from "@/lib/hermesClient";

export function CommandView() {
  const [conn, setConn] = useState<PublicHermesConnection | null>(null);
  const [adminBaseUrl, setAdminBaseUrl] = useState("");
  const [authMode, setAuthMode] = useState("auto");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("");
  const [connected, setConnected] = useState(false);

  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [currentProvider, setCurrentProvider] = useState<string | null>(null);
  const [options, setOptions] = useState<ModelOptions | null>(null);
  const [busyModel, setBusyModel] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);

  const refreshLive = async () => {
    const [info, opts, sys] = await Promise.all([
      hermesApi.modelInfo(),
      hermesApi.modelOptions(),
      hermesApi.systemStats(),
    ]);
    if (info.ok && info.data) {
      setCurrentModel((info.data.model as string) ?? null);
      setCurrentProvider((info.data.provider as string) ?? null);
    }
    if (opts.ok) setOptions(opts.data);
    if (sys.ok) setStats(sys.data);
  };

  // Test the stored connection and, when it's good, mark connected + pull the
  // live model data. Shared by the mount auto-connect and the SAVE & TEST button.
  const connect = async () => {
    setStatus("Testing connection…");
    const t = await testConnection();
    if (t.ok) {
      setConnected(true);
      setStatus(
        t.authenticated === false
          ? `⚠️ Reachable but NOT authenticated — set authMode "session" + a valid token. Current model: ${t.model ?? "?"}`
          : `✅ Connected${t.authenticated ? " & authenticated" : ""}${t.loopback ? " (loopback, no auth)" : ""}. Current model: ${t.model ?? "?"}`,
      );
      await refreshLive();
    } else {
      setConnected(false);
      setStatus(`❌ ${t.error || `HTTP ${t.status}`}`);
    }
  };

  // On mount: load the saved connection and auto-connect when it's usable
  // (loopback needs no token; otherwise a token must be present) so the model
  // catalog is ready without clicking SAVE & TEST on every page load.
  useEffect(() => {
    getConnection().then((c) => {
      if (!c) return;
      setConn(c);
      setAdminBaseUrl(c.adminBaseUrl);
      setAuthMode(c.authMode);
      if (c.isLoopback || c.hasToken) void connect();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSaveAndTest = async () => {
    setStatus("Saving…");
    const saved = await saveConnection({ adminBaseUrl, authMode, token });
    if (!saved.ok) {
      setStatus(`❌ ${saved.error}`);
      return;
    }
    setToken("");
    if (saved.connection) setConn(saved.connection);
    await connect();
  };

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

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Title */}
      <div className="mb-2 flex items-center gap-3">
        <span className="font-display text-[13px] tracking-[0.3em] text-gold">
          ⚡
        </span>
        <h1 className="font-display text-[32px] font-semibold tracking-[0.06em] text-marble">
          Command
        </h1>
      </div>
      <p className="mb-8 font-read text-[16px] text-parch">
        Command the Hermes agent over its management API. Every request is
        proxied server-side — your token never reaches the browser.
      </p>

      {/* Status message */}
      {status && (
        <div className="mb-4 break-words border border-hair bg-panel px-3 py-2 font-mono text-[13px] text-parch">
          {status}
        </div>
      )}

      {/* Connection section */}
      <section className="mb-4 border border-hair bg-paneldk p-4">
        <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
          ⌁ CONNECTION
        </div>
        <label className="mb-3 block">
          <span className="mb-1 block font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
            Management base URL (Hermes dashboard, default :9119)
          </span>
          <input
            className="hxinp"
            value={adminBaseUrl}
            onChange={(e) => setAdminBaseUrl(e.target.value)}
            placeholder="http://127.0.0.1:9119"
          />
        </label>
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
              Auth mode
            </span>
            <select
              className="hxinp"
              value={authMode}
              onChange={(e) => setAuthMode(e.target.value)}
            >
              <option value="auto">auto (none on loopback, else bearer)</option>
              <option value="none">none</option>
              <option value="bearer">bearer token</option>
              <option value="cookie">session cookie</option>
              <option value="session">session (X-Hermes-Session-Token)</option>
            </select>
          </label>
          <p className="col-span-1 -mt-1 font-mono text-[10.5px] text-mutedlo sm:col-span-2">
            Hermes&apos;s management API (model catalog, model switching) requires
            <span className="text-parch"> session</span> mode.
          </p>
          <label className="block">
            <span className="mb-1 block font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
              Token / cookie {conn?.hasToken ? "(set — blank keeps it)" : ""}
            </span>
            <input
              className="hxinp"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={authMode === "cookie" ? "session=…" : "token…"}
            />
          </label>
        </div>
        {conn && (
          <p className="mb-3 font-mono text-[11px] text-mutedlo">
            {conn.isLoopback
              ? "Loopback URL detected — Hermes serves /api/* without auth here."
              : "Non-loopback URL — Hermes requires auth; set a token above."}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={onSaveAndTest}
            className="btn-gold px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em]"
          >
            SAVE & TEST
          </button>
          {conn && (
            <span className="flex items-center gap-1.5">
              <span
                className={`status-dot ${
                  connected ? "status-dot-malach" : "status-dot-carnelian"
                }`}
              />
              <span className="font-mono text-[11px] text-muted">
                {connected ? "connected" : "not connected"}
              </span>
            </span>
          )}
        </div>
      </section>

      {/* Picker curation — all providers, independent of Hermes connection */}
      <ModelCuration />

      {/* Model section */}
      {connected && (
        <section className="mb-4 border border-hair bg-paneldk p-4">
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
      )}

      {/* System stats */}
      {connected && stats && (
        <section className="mb-4 border border-hair bg-paneldk p-4">
          <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
            ⌁ SYSTEM
          </div>
          <pre className="max-h-60 overflow-auto border border-hair bg-void p-3 font-mono text-[12px] text-parch">
            {JSON.stringify(stats, null, 2)}
          </pre>
        </section>
      )}

      <p className="mt-6 font-mono text-[11px] text-mutedlo">
        Next to plug in: cron jobs, sessions browser, config/env editor, MCP &
        webhook management — all over the same proxy.
      </p>

      <style jsx>{`
        :global(.hxinp) {
          width: 100%;
          background: var(--void);
          border: 1px solid var(--hairlit);
          padding: 0.5rem 0.75rem;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 0.8125rem;
          color: var(--marble);
          outline: none;
        }
        :global(.hxinp:focus) {
          border-color: var(--gold);
          box-shadow: 0 0 0 1px var(--gold), 0 0 18px rgba(201, 162, 75, 0.18);
        }
        :global(.hxinp::placeholder) {
          color: var(--mutedlo);
        }
      `}</style>
    </div>
  );
}

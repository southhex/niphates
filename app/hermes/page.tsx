"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getConnection,
  saveConnection,
  testConnection,
  hermesApi,
  type PublicHermesConnection,
  type ModelOptions,
} from "@/lib/hermesClient";

function modelIds(opts: ModelOptions | null): string[] {
  if (!opts?.models) return [];
  return opts.models
    .map((m) => (typeof m === "string" ? m : m.id || m.name || ""))
    .filter(Boolean) as string[];
}

export default function HermesControlPage() {
  const [conn, setConn] = useState<PublicHermesConnection | null>(null);
  const [adminBaseUrl, setAdminBaseUrl] = useState("");
  const [authMode, setAuthMode] = useState("auto");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("");
  const [connected, setConnected] = useState(false);

  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [currentProvider, setCurrentProvider] = useState<string | null>(null);
  const [options, setOptions] = useState<ModelOptions | null>(null);
  const [pickModel, setPickModel] = useState("");
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    getConnection().then((c) => {
      if (!c) return;
      setConn(c);
      setAdminBaseUrl(c.adminBaseUrl);
      setAuthMode(c.authMode);
    });
  }, []);

  const refreshLive = async () => {
    const [info, opts, sys] = await Promise.all([
      hermesApi.modelInfo(),
      hermesApi.modelOptions(),
      hermesApi.systemStats(),
    ]);
    if (info.ok && info.data) {
      setCurrentModel((info.data.model as string) ?? null);
      setCurrentProvider((info.data.provider as string) ?? null);
      setPickModel((info.data.model as string) ?? "");
    }
    if (opts.ok) setOptions(opts.data);
    if (sys.ok) setStats(sys.data);
  };

  const onSaveAndTest = async () => {
    setStatus("Saving…");
    const saved = await saveConnection({ adminBaseUrl, authMode, token });
    if (!saved.ok) {
      setStatus(`❌ ${saved.error}`);
      return;
    }
    setToken("");
    if (saved.connection) setConn(saved.connection);
    setStatus("Testing connection…");
    const t = await testConnection();
    if (t.ok) {
      setConnected(true);
      setStatus(
        `✅ Connected${t.loopback ? " (loopback, no auth)" : ""}. Current model: ${
          t.model ?? "?"
        }`,
      );
      await refreshLive();
    } else {
      setConnected(false);
      setStatus(`❌ ${t.error || `HTTP ${t.status}`}`);
    }
  };

  const onSetModel = async () => {
    if (!pickModel || pickModel === currentModel) return;
    setStatus(`Switching to ${pickModel}…`);
    const res = await hermesApi.setModel(pickModel);
    if (res.ok) {
      setStatus(`✅ Active model is now ${pickModel}`);
      await refreshLive();
    } else {
      setStatus(`❌ ${res.error}`);
    }
  };

  const available = modelIds(options);

  return (
    <div className="min-h-screen bg-ground">
      {/* Command bar */}
      <div className="flex items-center justify-between border-b border-gold px-6 py-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-gold">
          NIPHATES // CONTROL
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
        <div className="mb-2 flex items-center gap-3">
          <h1 className="font-display text-[32px] font-semibold uppercase tracking-[0.08em] text-marble">
            ⚡ Hermes Control
          </h1>
        </div>
        <p className="mb-8 font-read text-[16px] text-parch">
          Manage your Hermes Agent over its management API. The connection below
          proxies every request server-side — your token never reaches the
          browser.
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
              </select>
            </label>
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
            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="mb-1 block font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
                  Switch model
                </span>
                {available.length > 0 ? (
                  <select
                    className="hxinp min-w-[16rem]"
                    value={pickModel}
                    onChange={(e) => setPickModel(e.target.value)}
                  >
                    {available.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="hxinp min-w-[16rem]"
                    value={pickModel}
                    onChange={(e) => setPickModel(e.target.value)}
                    placeholder="model id"
                  />
                )}
              </label>
              <button
                onClick={onSetModel}
                disabled={!pickModel || pickModel === currentModel}
                className="border border-hair px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-parch hover:border-malach hover:text-malach disabled:opacity-40"
              >
                SET ACTIVE
              </button>
              <button
                onClick={refreshLive}
                className="border border-hair px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-parch hover:border-lapis hover:text-lapis"
              >
                REFRESH
              </button>
            </div>
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
      </div>

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

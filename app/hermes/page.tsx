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
    setToken(""); // never keep the secret in the form
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
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">⚡ Hermes Control</h1>
        <Link href="/" className="text-sm text-amber-400 hover:underline">
          ← Back to chat
        </Link>
      </div>

      <p className="mb-4 text-sm text-slate-400">
        Manage your Hermes Agent over its management API. The connection below
        proxies every request server-side (your token never reaches the
        browser), so control features plug in here as they land.
      </p>

      {status && (
        <div className="mb-4 break-words rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300">
          {status}
        </div>
      )}

      {/* Connection */}
      <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="font-medium">Connection</h2>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-400">
            Management base URL (Hermes dashboard, default :9119)
          </span>
          <input
            className="hxinp"
            value={adminBaseUrl}
            onChange={(e) => setAdminBaseUrl(e.target.value)}
            placeholder="http://127.0.0.1:9119"
          />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-400">Auth mode</span>
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
          <label className="block text-sm">
            <span className="mb-1 block text-slate-400">
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
          <p className="text-xs text-slate-500">
            {conn.isLoopback
              ? "Loopback URL detected — Hermes serves /api/* without auth here."
              : "Non-loopback URL — Hermes requires auth; set a token above."}
          </p>
        )}
        <button
          onClick={onSaveAndTest}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
        >
          Save & test connection
        </button>
      </section>

      {/* Model control (proof of the read+write pipe) */}
      {connected && (
        <section className="mt-4 space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="font-medium">Model</h2>
          <p className="text-sm text-slate-400">
            Current:{" "}
            <span className="text-slate-200">{currentModel ?? "unknown"}</span>
            {currentProvider ? (
              <span className="text-slate-500"> · {currentProvider}</span>
            ) : null}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-400">Switch model</span>
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
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-40"
            >
              Set active
            </button>
            <button
              onClick={refreshLive}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
            >
              Refresh
            </button>
          </div>
        </section>
      )}

      {/* System stats (proof of a plain read endpoint) */}
      {connected && stats && (
        <section className="mt-4 space-y-2 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="font-medium">System</h2>
          <pre className="max-h-60 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-400">
            {JSON.stringify(stats, null, 2)}
          </pre>
        </section>
      )}

      <p className="mt-6 text-xs text-slate-600">
        Next to plug in: cron jobs, sessions browser, config/env editor, MCP &
        webhook management — all over the same proxy.
      </p>

      <style jsx>{`
        :global(.hxinp) {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid #334155;
          background: #0f172a;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          outline: none;
          color: #e2e8f0;
        }
        :global(.hxinp:focus) {
          border-color: #f59e0b;
        }
      `}</style>
    </div>
  );
}

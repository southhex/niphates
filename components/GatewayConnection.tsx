// components/GatewayConnection.tsx
// The Gateway is the single Hermes connection: the management plane (admin URL +
// auth) that powers the Command chamber, plus the inference (/v1) endpoint used
// for chat. Lives in Settings → Connections. Secrets never reach the browser —
// the token/key are stored server-side and only their presence is reported back.
"use client";

import { useEffect, useState } from "react";
import {
  getConnection,
  saveConnection,
  testConnection,
  type PublicHermesConnection,
} from "@/lib/hermesClient";

export function GatewayConnection() {
  const [conn, setConn] = useState<PublicHermesConnection | null>(null);
  const [adminBaseUrl, setAdminBaseUrl] = useState("");
  const [authMode, setAuthMode] = useState("auto");
  const [token, setToken] = useState("");
  const [chatBaseUrl, setChatBaseUrl] = useState("");
  const [chatKey, setChatKey] = useState("");
  const [status, setStatus] = useState("");
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    getConnection().then((c) => {
      if (!c) return;
      setConn(c);
      setAdminBaseUrl(c.adminBaseUrl);
      setAuthMode(c.authMode);
      setChatBaseUrl(c.chatBaseUrl ?? "");
    });
  }, []);

  const onSaveAndTest = async () => {
    setStatus("Saving…");
    const saved = await saveConnection({
      adminBaseUrl,
      authMode,
      token,
      chatBaseUrl,
      chatKey,
    });
    if (!saved.ok) {
      setStatus(`❌ ${saved.error}`);
      return;
    }
    setToken("");
    setChatKey("");
    if (saved.connection) setConn(saved.connection);

    setStatus("Testing connection…");
    const t = await testConnection();
    if (t.ok) {
      setConnected(true);
      setStatus(
        t.authenticated === false
          ? `⚠️ Reachable but NOT authenticated — set auth mode "session" + a valid token. Current model: ${t.model ?? "?"}`
          : `✅ Connected${t.authenticated ? " & authenticated" : ""}${t.loopback ? " (loopback, no auth)" : ""}. Current model: ${t.model ?? "?"}`,
      );
    } else {
      setConnected(false);
      setStatus(`❌ ${t.error || `HTTP ${t.status}`}`);
    }
  };

  return (
    <section className="border border-hair bg-paneldk p-4">
      <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
        ⌁ GATEWAY
      </div>
      <p className="mb-4 font-mono text-[12px] text-parch">
        The Hermes connection. Required for the Command chamber and for chatting
        with Hermes Agent. Every request is proxied server-side — your token and
        key never reach the browser.
      </p>

      {status && (
        <div className="mb-4 break-words border border-hair bg-panel px-3 py-2 font-mono text-[13px] text-parch">
          {status}
        </div>
      )}

      <label className="mb-3 block">
        <span className="mb-1 block font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
          Management base URL (Hermes dashboard, default :9119)
        </span>
        <input
          className="inp"
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
            className="inp"
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
            className="inp"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={authMode === "cookie" ? "session=…" : "token…"}
          />
        </label>
      </div>

      <label className="mb-3 block">
        <span className="mb-1 block font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
          Chat (inference /v1) base URL — default :8642
        </span>
        <input
          className="inp"
          value={chatBaseUrl}
          onChange={(e) => setChatBaseUrl(e.target.value)}
          placeholder="http://127.0.0.1:8642/v1"
        />
      </label>

      <label className="mb-3 block">
        <span className="mb-1 block font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
          Chat API key {conn?.hasChatKey ? "(set — blank keeps it)" : ""}
        </span>
        <input
          className="inp"
          type="password"
          value={chatKey}
          onChange={(e) => setChatKey(e.target.value)}
          placeholder="API_SERVER_KEY…"
        />
      </label>

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
  );
}

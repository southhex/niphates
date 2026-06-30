"use client";

// components/GatewayConnection.tsx
// The Gateway is the single Hermes connection: the management plane (admin URL +
// cookie auth) that powers the Command chamber, plus the inference (/v1)
// endpoint used for chat. Lives in Settings → Connections. Secrets never reach
// the browser — credentials are POSTed to /api/hermes/login, the resulting
// session cookie is what gets persisted.

import { useEffect, useState } from "react";
import {
  getConnection,
  login,
  logout,
  saveConnection,
  testConnection,
  type PublicHermesConnection,
} from "@/lib/hermesClient";

export function GatewayConnection() {
  const [conn, setConn] = useState<PublicHermesConnection | null>(null);
  const [adminBaseUrl, setAdminBaseUrl] = useState("");
  const [chatBaseUrl, setChatBaseUrl] = useState("");
  const [chatKey, setChatKey] = useState("");
  const [status, setStatus] = useState("");
  const [connected, setConnected] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    getConnection().then((c) => {
      if (!c) return;
      setConn(c);
      setAdminBaseUrl(c.adminBaseUrl);
      setChatBaseUrl(c.chatBaseUrl ?? "");
    });
  }, []);

  const onSaveAndTest = async () => {
    setStatus("Saving…");
    const saved = await saveConnection({
      adminBaseUrl,
      authMode: conn?.hasToken ? "cookie" : "none",
      chatBaseUrl,
      chatKey,
    });
    if (!saved.ok) {
      setStatus(`❌ ${saved.error}`);
      return;
    }
    setChatKey("");
    if (saved.connection) setConn(saved.connection);

    setStatus("Testing connection…");
    const t = await testConnection();
    if (t.ok) {
      setConnected(t.authenticated === true);
      setStatus(
        t.session_expired
          ? `⚠️ Session expired — click LOGIN to sign in again. Model: ${t.model ?? "?"}`
          : t.authenticated
            ? `✅ Connected & authenticated. Model: ${t.model ?? "?"}`
            : `⚠️ Reachable but NOT authenticated — click LOGIN if the dashboard requires it. Model: ${t.model ?? "?"}`,
      );
    } else {
      setConnected(false);
      setStatus(`❌ ${t.error || `HTTP ${t.status}`}`);
    }
  };

  const onLogin = async (username: string, password: string) => {
    setLoggingIn(true);
    setStatus("Signing in…");
    const r = await login(username, password);
    setLoggingIn(false);
    if (!r.ok) {
      setStatus(`❌ ${r.error ?? "Login failed"}`);
      return;
    }
    setShowLogin(false);
    setStatus("Signed in. Testing…");
    // Re-fetch the public view to pick up hasToken, then probe Hermes.
    const fresh = await getConnection();
    if (fresh) setConn(fresh);
    const t = await testConnection();
    setConnected(t.ok && t.authenticated === true);
    setStatus(
      t.ok
        ? `✅ Signed in & authenticated. Model: ${t.model ?? "?"}`
        : `⚠️ Signed in, but probe failed: ${t.error ?? `HTTP ${t.status}`}`,
    );
  };

  const onLogout = async () => {
    setStatus("Signing out…");
    const fresh = await logout();
    if (fresh) setConn(fresh);
    setConnected(false);
    setStatus("Signed out. Click LOGIN to sign in again.");
  };

  return (
    <section className="border border-hair bg-paneldk p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
          ⌁ GATEWAY
        </div>
        {conn && (
          <span className="flex items-center gap-1.5">
            <span
              className={`status-dot ${
                connected ? "status-dot-malach" : "status-dot-carnelian"
              }`}
            />
            <span className="font-mono text-[11px] text-muted">
              {connected
                ? "connected"
                : conn.hasToken
                  ? "signed in — probe again"
                  : "not connected"}
            </span>
          </span>
        )}
      </div>
      <p className="mb-4 font-mono text-[12px] text-parch">
        The Hermes connection. Required for the Command chamber and for chatting
        with Hermes Agent. Every request is proxied server-side — your session
        cookie and API key never reach the browser.
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

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={onSaveAndTest}
          className="btn-gold px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em]"
        >
          SAVE & TEST
        </button>
        {conn?.isLoopback && !conn.hasToken && (
          <span className="font-mono text-[11px] text-mutedlo">
            Loopback — no auth required.
          </span>
        )}
        {(!conn?.isLoopback || conn.hasToken) && (
          <>
            {conn?.hasToken ? (
              <button
                onClick={onLogout}
                className="border border-hair px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-parch hover:border-carnelian hover:text-carnelian"
              >
                LOGOUT
              </button>
            ) : (
              <button
                onClick={() => setShowLogin(true)}
                className="border border-gold px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-gold hover:bg-gold hover:text-goldink"
              >
                LOGIN
              </button>
            )}
          </>
        )}
      </div>

      <div className="mb-1 mt-6 font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
        ⌁ INFERENCE (CHAT)
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

      {showLogin && (
        <LoginModal
          busy={loggingIn}
          onCancel={() => setShowLogin(false)}
          onSubmit={onLogin}
          initialUsername=""
        />
      )}
    </section>
  );
}

function LoginModal({
  busy,
  initialUsername,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  initialUsername: string;
  onSubmit: (username: string, password: string) => void;
  onCancel: () => void;
}) {
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    onSubmit(username, password);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-sm border border-gold bg-paneldk p-5 shadow-2xl"
      >
        <div className="mb-1 font-display text-[18px] uppercase tracking-[0.08em] text-gold">
          ⌁ Dashboard Login
        </div>
        <p className="mb-4 font-mono text-[11px] text-muted">
          Sign in to the Hermes dashboard. Your password is used once and never
          stored — only the resulting session cookie is kept.
        </p>
        <label className="mb-3 block">
          <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">
            Username
          </span>
          <input
            className="inp"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="michael"
            disabled={busy}
          />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">
            Password
          </span>
          <input
            className="inp"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            disabled={busy}
          />
        </label>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="border border-hair px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-parch hover:border-hairlit hover:text-marble disabled:opacity-50"
          >
            CANCEL
          </button>
          <button
            type="submit"
            disabled={busy || !username || !password}
            className="btn-gold px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] disabled:opacity-50"
          >
            {busy ? "SIGNING IN…" : "SIGN IN"}
          </button>
        </div>
      </form>
    </div>
  );
}

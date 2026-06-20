# Niphates

A self-hosted, installable (PWA) chat web app for talking to your **Hermes
Agent** and other LLM APIs — Ollama, OpenRouter, KiloCode, OpenAI, Anthropic —
from one place, on desktop and mobile.

Built to start simple and grow. The core idea: most providers (Hermes, Ollama,
OpenRouter, KiloCode, OpenAI) speak the **OpenAI `/v1/chat/completions`**
format, so a single connector covers them. Anthropic gets a small adapter.

## Why this design

- **Hermes first.** Hermes Agent exposes an OpenAI-compatible server (default
  `http://127.0.0.1:8642/v1`, Bearer auth via its `API_SERVER_KEY`). It's the
  default provider and works out of the box once you point the app at it.
- **Keys stay server-side.** The browser never sees API keys. It talks to a
  `/api/chat` proxy that injects the key and streams the reply back. Good for a
  self-hosted, single-user setup.
- **Installable PWA.** Manifest + service worker, responsive layout, safe-area
  aware — add it to your home screen on phone or desktop.

## Quick start

```bash
npm install
cp .env.example .env.local   # set HERMES_BASE_URL + HERMES_API_KEY
npm run dev                  # http://localhost:3000
```

For production / self-hosting:

```bash
npm run build                # → .next
npm run start                # serves on :3000
```

> **PWA / service worker:** the service worker only registers in production builds
> **and only in a secure context** (HTTPS or `localhost`). Served over plain HTTP on
> a LAN IP (e.g. `http://10.0.0.5:3000`) it never registers — the app still works,
> but there's no offline support and "Add to Home Screen" is just a styled shortcut.
> For the full installable PWA, put it behind HTTPS (a reverse proxy with a cert, or
> `tailscale serve`).

> **Build dirs:** `next dev` writes to `.next-dev` while `next build`/`next start`
> use `.next`, so you can run dev and a production build from the same folder without
> them corrupting each other. To run both at once, give prod its own port:
> `PORT=3001 npm run start`.

## Configuration

Providers are seeded from environment variables on first run into
`data/providers.json` (git-ignored — it holds your keys). After that, manage
them in the **Settings** page: add/edit/delete providers, set models, and use
**Test** to probe reachability.

See `.env.example` for all supported variables. To re-seed from env, delete
`data/providers.json`.

### Adding a provider in the UI

| Field     | Example                              | Notes                                   |
| --------- | ------------------------------------ | --------------------------------------- |
| ID        | `openrouter`                         | stable slug                             |
| Type      | `openai` or `anthropic`              | most things are `openai`-compatible     |
| Base URL  | `https://openrouter.ai/api/v1`       | include `/v1` for openai-type           |
| API key   | secret                               | stored server-side, never returned      |
| Models    | `openai/gpt-4o-mini, ...`            | comma-separated                         |

## Hermes management (control plane)

Beyond chat, Hermes exposes a `/api/*` management API (models, cron jobs,
sessions, config, env, MCP servers, webhooks, system stats, …). The app talks
to it through **one server-side proxy** so your token never reaches the browser
and there's no CORS:

```
browser → /api/hx/<path>  →  hermesFetch  →  <HERMES_ADMIN_URL>/api/<path>
```

`lib/hermes.ts` owns the connection + auth policy in one place:

- **Loopback URL** (localhost/127.0.0.1) → Hermes serves `/api/*` without auth.
- **Non-loopback URL** → set an auth mode (`bearer`/`cookie`) + token; the proxy
  injects it server-side.

Configure and test it on the **Hermes Control** page (`/hermes`), which also
includes a live model switcher. Adding a new control feature (cron, sessions,
config editor, …) is just a new method in `lib/hermesClient.ts` — no new server
code, since everything flows through `/api/hx/*`.

> Note: Hermes' inference API (`/v1/*`, used for chat) and management API
> (`/api/*`) use **different** auth and often different ports — that's why the
> management base URL is configured separately from the chat provider.

## Architecture

```
app/
  page.tsx                  chat UI (provider/model picker, streaming, history)
  settings/page.tsx         provider management
  hermes/page.tsx           Hermes Control (connection, model switcher, stats)
  api/chat/route.ts         streaming chat proxy (keys injected server-side)
  api/providers/...         provider CRUD + connection test
  api/hx/[...path]/route.ts Hermes management proxy (the one pipe)
  api/hermes/connection/... management connection config + test
lib/
  providers.ts          server-side provider registry (data/providers.json)
  connectors.ts         OpenAI + Anthropic streaming connectors
  hermes.ts             Hermes admin client: connection, auth, hermesFetch
  hermesClient.ts       browser-side typed client over /api/hx/*
  client.ts             browser-side chat stream parser
  storage.ts            conversation history (localStorage)
public/
  sw.js, manifest...    PWA assets
```

Conversation history currently lives in the browser (localStorage). Moving it
server-side (SQLite/Postgres) is a natural next step.

## Roadmap ideas

- Anthropic verified end-to-end + per-provider max_tokens
- Markdown rendering + code-block copy buttons
- Hermes-native features: `/v1/responses`, long-form `/v1/runs` with live tool
  progress, sessions, and dashboard webhooks
- Server-side history + optional auth for multi-device sync
- Attachments / vision (Hermes and OpenAI accept inline images)

# Hermes Chat

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
npm run build
npm run start                # serves on :3000 (PWA + service worker active)
```

> The service worker only registers in production builds, so dev reloads aren't
> fought by the cache.

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

## Architecture

```
app/
  page.tsx              chat UI (provider/model picker, streaming, history)
  settings/page.tsx     provider management
  api/chat/route.ts     streaming proxy (keys injected server-side)
  api/providers/...     provider CRUD + connection test
lib/
  providers.ts          server-side registry (data/providers.json + env seed)
  connectors.ts         OpenAI + Anthropic streaming connectors
  client.ts             browser-side stream parser
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

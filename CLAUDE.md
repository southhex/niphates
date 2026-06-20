# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Niphates — a self-hosted, installable (PWA) multi-provider LLM chat app built on
Next.js 15 (App Router) + React 19 + TypeScript + Tailwind. The default/priority
provider is **Hermes Agent**; it also talks to Ollama, OpenRouter, KiloCode, OpenAI,
and Anthropic. Single-user by design: no auth, config lives in flat JSON files on disk.

## Commands

```bash
npm install
npm run dev      # next dev — http://localhost:3000 (service worker NOT registered)
npm run build    # production build
npm run start    # next start on :3000 (PWA + service worker active)
npm run lint     # next lint (ESLint not yet configured — prompts to set up on first run)
npm run test     # vitest run (one-shot)
npm run test:watch
npm run gen-icons # regenerate PWA icons from scripts/gen-icons.mjs (uses sharp)
```

Tests use **vitest** and live in `tests/`; run a single file with
`npx vitest run tests/sse.test.ts`. They cover the pure logic deliberately split out
of the server-only modules (SSE parsing in `lib/sse.ts`, Hermes auth resolution in
`lib/hermesAuth.ts`) — importing `"server-only"` code into a test would throw, so
testable logic must stay out of those modules.

First-run setup: `cp .env.example .env.local`, set `HERMES_BASE_URL` + `HERMES_API_KEY`.
Env vars only **seed** config on first run; see "Config persistence" below.

## Architecture

There are two distinct planes, with different auth, ports, and code paths. Keep them
separate — conflating them is the most common mistake here.

### 1. Chat / inference plane (`/v1/*` upstream)

Browser → `POST /api/chat` → `lib/connectors.ts` → upstream provider's
`/chat/completions` (or Anthropic `/v1/messages`).

- `app/api/chat/route.ts` looks up the provider **server-side** so the API key never
  reaches the browser, then streams back **newline-delimited JSON** (not SSE):
  `{"type":"delta","text":...}`, `{"type":"error",...}`, `{"type":"done"}`.
- `lib/connectors.ts` holds a dispatch table (`Record<ProviderType, Connector>`) — add a
  new wire format by adding an entry, not by editing `streamChat`. `openaiStream` covers
  everything OpenAI-shaped (Hermes, Ollama, OpenRouter, KiloCode, OpenAI); `anthropicStream`
  handles Anthropic's different request shape (system prompt hoisted to top-level field,
  `x-api-key` header, `max_tokens` required — defaults to 4096). Both normalize upstream
  **SSE** into a single async iterator via the pure helpers in `lib/sse.ts` (`sseLines`,
  `extractOpenAIDelta`, `extractAnthropicDelta`). `maxTokens` resolves request → provider
  default → connector fallback.
- `lib/client.ts` is the browser-side parser for the ndjson stream.

### 2. Hermes management / control plane (`/api/*` upstream)

Browser → `/api/hx/<path>` → `hermesFetch` → `<HERMES_ADMIN_URL>/api/<path>`.

- `app/api/hx/[...path]/route.ts` is **one catch-all proxy** for the entire Hermes
  management API (models, cron, sessions, config, env, MCP, webhooks, stats…). It passes
  the upstream response through verbatim. Adding a new control feature requires **no new
  server code** — only a new method in `lib/hermesClient.ts`.
- `lib/hermes.ts` owns the management connection (disk persistence + authenticated
  `hermesFetch`). The auth **policy** itself — loopback detection and header resolution —
  lives in the pure, testable `lib/hermesAuth.ts` (loopback URLs need no auth; non-loopback
  require a `bearer`/`cookie` token; `authMode: "auto"` resolves this). Change auth behavior
  in `hermesAuth.ts`; `hermes.ts` re-exports its types so existing `@/lib/hermes` imports
  keep working.
- `lib/hermesClient.ts` is the browser-side typed client over `/api/hx/*`.

> The inference API (`/v1/*`) and management API (`/api/*`) use **different auth and
> usually different ports** (8642 vs 9119). That's why `HERMES_BASE_URL` (chat provider)
> and `HERMES_ADMIN_URL` (control plane) are configured separately.

### Config & data persistence (env seeds once, then JSON wins)

All on-disk JSON goes through `lib/jsonStore.ts` — a generic store that **serializes
writes** behind a per-file promise queue and writes **atomically** (temp file + rename),
so concurrent requests can't interleave a read-modify-write or leave a truncated file.
Mutations must use `store.update(fn)` (serialized RMW), not read-then-write.

- `data/providers.json` (git-ignored, holds API keys) — provider registry, `lib/providers.ts`.
  Seeded from env on first run; after that the **file is authoritative**. Re-seed by deleting it.
- `data/hermes.json` — management connection config, `lib/hermes.ts`. Uses the store's
  `merge` option so the env seed fills in newly-added fields under the stored values.
- `data/conversations.json` (git-ignored) — server-side chat history, `lib/conversationStore.ts`,
  served via `app/api/conversations`.

Provider CRUD is exposed at `app/api/providers/*`.

### Validation

Request bodies and on-disk shapes are validated with **zod** schemas in `lib/schemas.ts`
(`chatRequestSchema`, `providerSchema`, `hermesConnectionInputSchema`, `conversationsSchema`).
Routes `safeParse` at the boundary and return `formatZodError(...)` as a 400 — don't cast
`await req.json()` to a type without parsing it first. `lib/types.ts` holds the TS types;
schemas mirror them for runtime enforcement.

### Server-only boundary

`lib/providers.ts`, `lib/connectors.ts`, `lib/hermes.ts`, `lib/jsonStore.ts`, and
`lib/conversationStore.ts` all import `"server-only"` and read secrets/disk — **never**
import them into a client component. Pure logic extracted for reuse/testing
(`lib/sse.ts`, `lib/hermesAuth.ts`, `lib/schemas.ts`, `lib/types.ts`) deliberately omits
`"server-only"`. The browser only ever
sees the redacted views: `toPublic` (providers) and `toPublicConnection` (Hermes), which
strip secrets down to a boolean `hasKey`/`hasToken`. `lib/types.ts` is framework-agnostic
and shared by both sides.

### UI

`app/page.tsx` (chat), `app/settings/page.tsx` (provider management), `app/hermes/page.tsx`
(Hermes Control: connection config, live model switcher, stats). Components in
`components/`. `RegisterSW.tsx` registers `public/sw.js` — production builds only.

## Conventions

- Provider `baseUrl` semantics differ by type: openai-type includes `/v1` (POST to
  `${baseUrl}/chat/completions`); anthropic-type is the bare host (POST to
  `${baseUrl}/v1/messages`). Don't normalize these together.
- Conversation history is **server-side** (`data/conversations.json` via
  `app/api/conversations`). `lib/storage.ts` is the browser client: `loadConversations()`
  is async; `saveConversations()` is fire-and-forget and **debounced/coalesced** (the chat
  UI calls it on every streamed token; one PUT lands ~400ms after the last). Call
  `flushConversations()` to force a write (done when a stream completes).
- Path alias `@/*` maps to the repo root (see `tsconfig.json`). Tests import via relative
  paths (`../lib/...`) since vitest doesn't resolve the alias.

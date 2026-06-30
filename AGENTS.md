# AGENTS.md

Guidance for AI coding agents working in this repository. If you've read CLAUDE.md, this is the same project through a tooling-focused lens — read both, but when they disagree, CLAUDE.md is the source of truth on architecture.

## What this is

Niphates — a self-hosted, installable (PWA) multi-provider LLM chat app built on Next.js 15 (App Router) + React 19 + TypeScript + Tailwind. Default/priority provider is **Hermes Agent**; also talks to Ollama, OpenRouter, KiloCode, OpenAI, and Anthropic. Single-user by design: no auth, config lives in flat JSON files on disk.

## Commands

```bash
npm install
npm run dev          # next dev — http://localhost:3000 (dev never registers the SW)
npm run build        # production build → .next
npm run start        # next start on :3000 (SW registers only over HTTPS/localhost)
npm run start -- -p 3001   # prod on a second port
npm run lint         # next lint (ESLint not yet configured — prompts on first run)
npm run test         # vitest run (one-shot)
npm run test:watch   # vitest watch
npm run gen-icons    # regenerate PWA icons from scripts/gen-icons.mjs (uses sharp)
npx vitest run tests/sse.test.ts   # run a single test file
```

### Build directory split

`next dev` writes to `.next-dev`; `next build`/`next start` use `.next` (configured in `next.config.mjs`). This is deliberate — sharing `.next` let dev recompiles corrupt production chunks. You can run both at once: dev on 3000, prod on 3001.

### Service worker

`public/sw.js` only registers in a secure context (HTTPS or `localhost`) on production builds. Plain HTTP on a LAN IP → no SW, no offline support, PWA install is just a home-screen shell. Use HTTPS (reverse proxy with a cert, or `tailscale serve`) for the full PWA.

### First-run setup

`cp .env.example .env.local`, set `HERMES_BASE_URL` + `HERMES_API_KEY`. Env vars only **seed** config on first run — after that the JSON files are authoritative. Re-seed by deleting the relevant `data/*.json`.

## Architecture

Two distinct planes with different auth, ports, and code paths. **Conflating them is the most common mistake here.**

### 1. Chat / inference plane (`/v1/*` upstream)

Browser → `POST /api/chat` → `lib/connectors.ts` → upstream provider's `/chat/completions` (or Anthropic `/v1/messages`).

- `app/api/chat/route.ts` looks up the provider **server-side** (API key never reaches the browser), streams back **newline-delimited JSON** (not SSE): `{"type":"delta","text":...}`, `{"type":"error",...}`, `{"type":"done"}`.
- `lib/connectors.ts` holds a dispatch table (`Record<ProviderType, Connector>`) — add a new wire format by adding an entry, not by editing `streamChat`. `openaiStream` covers everything OpenAI-shaped (Hermes, Ollama, OpenRouter, KiloCode, OpenAI); `anthropicStream` handles Anthropic's different request shape. Both normalize upstream **SSE** via pure helpers in `lib/sse.ts` (`sseLines`, `extractOpenAIDelta`, `extractAnthropicDelta`).
- `lib/client.ts` is the browser-side parser for the ndjson stream.

### 2. Hermes management / control plane (`/api/*` upstream)

Browser → `/api/hx/<path>` → `hermesFetch` → `<HERMES_ADMIN_URL>/api/<path>`.

- `app/api/hx/[...path]/route.ts` is **one catch-all proxy** for the entire Hermes management API (models, cron, sessions, config, env, MCP, webhooks, stats…). Passes upstream response through verbatim. Adding a new control feature requires **no new server code** — only a new method in `lib/hermesClient.ts`.
- `lib/hermes.ts` owns the management connection (disk persistence + authenticated `hermesFetch`). The auth **policy** — loopback detection and header resolution — lives in the pure, testable `lib/hermesAuth.ts`. Supported auth modes: `auto`, `none`, `bearer`, `cookie`, `session`, `basic`.
- `lib/hermesClient.ts` is the browser-side typed client over `/api/hx/*`.

> Inference API (`/v1/*`) and management API (`/api/*`) use **different auth and usually different ports** (8642 vs 9119). `HERMES_BASE_URL` (chat provider) and `HERMES_ADMIN_URL` (control plane) are configured separately.

## Config & data persistence

All on-disk JSON goes through `lib/jsonStore.ts` — serializes writes behind a per-file promise queue and writes **atomically** (temp file + rename). Concurrent requests can't interleave a read-modify-write or leave a truncated file. **Mutations must use `store.update(fn)` (serialized RMW), not read-then-write.**

| File | Purpose | Module |
|------|---------|--------|
| `data/providers.json` (git-ignored) | Provider registry, holds API keys | `lib/providers.ts` |
| `data/hermes.json` | Management connection config | `lib/hermes.ts` |
| `data/conversations.json` (git-ignored) | Server-side chat history | `lib/conversationStore.ts` |
| `data/connectors.json` | Connector resources (vaults, tools) | `lib/resourceConnectors.ts` |
| `data/sanctum.json` | Journal settings (connectorId + folder + template + wordGoal) | `lib/sanctum.ts` |
| `data/sanctum-wordcounts.json` (git-ignored) | Derived per-file word-count cache | `lib/sanctum.ts` |

Env vars seed config on first run only; after that the **file is authoritative**. `data/hermes.json` and `data/sanctum.json` use the store's `merge` option so newly-added fields default for existing installs.

## Validation

Request bodies and on-disk shapes are validated with **zod** schemas in `lib/schemas.ts` (`chatRequestSchema`, `providerSchema`, `hermesConnectionInputSchema`, `conversationsSchema`). Routes `safeParse` at the boundary and return `formatZodError(...)` as a 400. **Don't cast `await req.json()` to a type without parsing it first.** `lib/types.ts` holds the TS types; schemas mirror them for runtime enforcement.

## Server-only boundary

`lib/providers.ts`, `lib/connectors.ts`, `lib/hermes.ts`, `lib/jsonStore.ts`, and `lib/conversationStore.ts` all import `"server-only"` and read secrets/disk — **never import them into a client component.** Pure logic extracted for reuse/testing (`lib/sse.ts`, `lib/hermesAuth.ts`, `lib/schemas.ts`, `lib/types.ts`) deliberately omits `"server-only"`. The browser only ever sees redacted views: `toPublic` (providers) and `toPublicConnection` (Hermes), which strip secrets down to a boolean `hasKey`/`hasToken`.

## API routes

```
app/api/
├── chat/route.ts                      # Chat inference (ndjson stream)
├── connectors/route.ts                # Connector CRUD
├── conversations/route.ts             # Server-side conversation history
├── hermes/connection/route.ts         # Hermes connection config
├── hermes/connection/test/route.ts    # Test Hermes connection
├── hx/[...path]/route.ts             # Catch-all proxy → Hermes management API
├── providers/route.ts                # Provider CRUD
├── providers/[id]/models/route.ts    # List models for a provider
├── providers/discover/route.ts       # Provider discovery
├── providers/test/route.ts           # Test provider connection
├── runs/approval/route.ts            # Run approval flow
├── sanctum/route.ts                  # Sanctum settings
├── sanctum/entries/route.ts          # Entry list + create (idempotent)
├── sanctum/entries/[name]/route.ts   # Entry read/update/delete
└── sanctum/folders/route.ts          # Folder listing for connector
```

## UI

The app uses a **chamber navigation** pattern — five chambers in the sidebar, each with subsections that act as main tabs. Chamber routing lives in `app/page.tsx`; per-chamber view components route by subsection string.

| Chamber | Subsection(s) | View component | Purpose |
|---------|---------------|----------------|---------|
| Dialogue | (conversation list) | inline in `page.tsx` | Chat with providers |
| Studio | — | placeholder | Not yet built |
| Library | Sanctum | `LibraryView` → `SanctumView` | Journaling |
| Council | — | placeholder | Not yet built |
| Command | Connectors, Sessions, Models, Cron, Memory, Voice, Channels, Keys | `CommandView` | Hermes control |

`components/chambers.ts` holds the metadata (chamber list + per-chamber subsections) and `firstSubsection(chamber)`. Selecting a chamber resolves `subsection` to its first subsection.

**Sanctum** (`Library → Sanctum`): `components/SanctumView.tsx` (journal UI: entry list + editor + settings), `components/MarkdownEditor.tsx` (CodeMirror 6 live-preview editor), `lib/sanctum.ts` (server-side entry CRUD + settings + word-count cache). Live preview is driven off the **Lezer markdown syntax tree**, NOT regex. YAML frontmatter is stripped from the editing surface but preserved across saves. Entry titles are derived from filenames, not stored in files.

## Conventions

- **Path alias** `@/*` maps to the repo root (see `tsconfig.json`). Tests import via relative paths (`../lib/...`) since vitest doesn't resolve the alias.
- **Provider `baseUrl` semantics differ by type**: openai-type includes `/v1` (POST to `${baseUrl}/chat/completions`); anthropic-type is the bare host (POST to `${baseUrl}/v1/messages`). Don't normalize these together.
- **Conversation history is server-side** (`data/conversations.json` via `app/api/conversations`). `lib/storage.ts` is the browser client: `loadConversations()` is async; `saveConversations()` is fire-and-forget and **debounced/coalesced** (~400ms after the last token). Call `flushConversations()` to force a write (done when a stream completes).
- **Two files with similar names**: `lib/connectors.ts` (chat wire adapters — OpenAI/Anthropic streams) and `lib/resourceConnectors.ts` (connector resource registry — vaults/tools) are **completely different files**. Don't confuse them.
- **Connector type extensibility**: to add a new connector type (e.g. `mcp-server`), add a type to `ConnectorType`, a config interface, and a validation branch in `validateConnector()` in `lib/resourceConnectors.ts`.
- **Tailwind `--gold` is a bare hex with no `<alpha-value>` channel** — opacity modifiers like `bg-gold/50` silently no-op. Use inline `color-mix` for gold tints with opacity.
- **Tests cover pure logic split out of server-only modules** (SSE parsing in `lib/sse.ts`, Hermes auth in `lib/hermesAuth.ts`) — importing `"server-only"` code into a test would throw, so testable logic must stay out of those modules.

## Hermes session titles

Titles are synced from Niphates via `PATCH /api/sessions/{conversationId}` through the `/api/hx/*` proxy — on **first message** of a new conversation (auto-title from first 40 chars of the user's message) and on **explicit rename** via the Sidebar menu or `/title` command. All pushes are fire-and-forget — local title stays as source of truth. Hermes' own auto-title never fires for Niphates sessions (it counts all user messages in full history and bails when `> 2`).

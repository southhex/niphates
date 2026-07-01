# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Niphates — a self-hosted, installable (PWA) multi-provider LLM chat app built on
Next.js 15 (App Router) + React 19 + TypeScript + Tailwind. The default/priority
provider is **Hermes Agent**; it also talks to Ollama, OpenRouter, KiloCode, OpenAI,
and Anthropic. Single-user by design: no auth, config lives in flat JSON files on disk.

## Commands

```
npm install
npm run dev          # next dev — http://localhost:3000 (dev never registers the SW)
npm run build        # production build → .next
npm run start        # next start on :3000 (SW registers only over HTTPS/localhost — see below)
npm run lint         # next lint (ESLint not yet configured — prompts to set up on first run)
npm run test         # vitest run (one-shot)
npm run test:watch
npm run gen-icons     # regenerate PWA icons from scripts/gen-icons.mjs (uses sharp)
```

### Key dependencies added (Jun 2026)

- `codemirror` + `@codemirror/view`, `@codemirror/state`, `@codemirror/lang-markdown`,
  `@codemirror/commands`, `@codemirror/search`, `@codemirror/language`,
  `@codemirror/theme-one-dark` — live preview markdown editor for Sanctum
- `date-fns` — date formatting for Sanctum filename templates
- `react-markdown` + `remark-gfm` — markdown rendering (was already present, used in editor preview)

**Hermes session titles** are synced from Niphates via `PATCH /api/sessions/{conversationId}` through
the `/api/hx/*` proxy. Niphates pushes:
- On **first message** of a new conversation (auto-title from the first 40 chars of the user's message).
- On **explicit rename** via the Sidebar menu or `/title` command.

All title pushes are fire-and-forget — if Hermes is disconnected or the session row doesn't exist yet,
the local title stays as the source of truth and no error surfaces to the user. Hermes' own auto-title
does NOT fire for Niphates sessions because it counts all user messages in the full conversation history
and bails when `> 2`, which happens immediately since Niphates sends the full history on every turn.

**Build directories are split by phase** (`next.config.mjs`): `next dev` writes to
`.next-dev`; `next build`/`next start` use `.next`. This is deliberate — they used to
share `.next`, so running dev and a prod build from the same folder let the dev
server's on-demand recompiles overwrite the production chunks, corrupting `.next` →
`next start` then threw at runtime and served the unstyled error page. With separate
dirs you can run both at once: dev on 3000, prod on another port via
`PORT=3001 npm run start` (or `npm run start -- -p 3001`).

The **service worker** (`public/sw.js`) only registers in a secure context (HTTPS or
`localhost`) on production builds. Self-hosted over plain HTTP on a LAN IP it never
runs — no offline support; "installing" the PWA is just a home-screen shell. Use
HTTPS (reverse proxy with a cert, or `tailscale serve`) for the full PWA.

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
  lives in the pure, testable `lib/hermesAuth.ts`. Supported auth modes:
  `auto` (loopback=none, else bearer), `none`, `bearer`, `cookie`, `session`,
  and **`basic`** (username + password → `POST /auth/password-login` → session cookie).
  For `basic` mode, `hermesFetch` transparently authenticates on first call and caches
  the session cookie in memory; cache is invalidated when connection config changes via
  `saveHermesConnection`. Change auth behavior in `hermesAuth.ts`; `hermes.ts` re-exports
  its types so existing `@/lib/hermes` imports keep working.
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
- `data/connectors.json` — connector resources (vaults, tools, external services),
  `lib/resourceConnectors.ts`. Validates connector config against the filesystem at write time.
- `data/sanctum.json` — journal settings (connectorId + folder + filename template +
  wordGoal), `lib/sanctum.ts`. Uses the store's `merge` so newly-added fields (e.g. wordGoal)
  default for existing installs.
- `data/sanctum-wordcounts.json` (git-ignored) — derived per-file word-count cache, rebuilt
  on demand by `lib/sanctum.ts`.

Provider CRUD is exposed at `app/api/providers/*`.
Connector CRUD is at `app/api/connectors/*`.
Sanctum settings + entries are at `app/api/sanctum/*`, `app/api/sanctum/entries/*`,
`app/api/sanctum/folders`.

### Validation

Request bodies and on-disk shapes are validated with **zod** schemas in `lib/schemas.ts`
(`chatRequestSchema`, `providerSchema`, `hermesConnectionInputSchema`, `conversationsSchema`).
Routes `safeParse` at the boundary and return `formatZodError(...)` as a 400 — don't cast
`await req.json()` to a type without parsing it first. `lib/types.ts` holds the TS types;
schemas mirror them for runtime enforcement.

### Server-only boundary

`lib/providers.ts`, `lib/connectors.ts`, `lib/hermes.ts`, `lib/jsonStore.ts`, and
`lib/conversationStore.ts` all import `"server-only"` and read secrets/disk — **never**
import them into a client component. `lib/honchoConfig.ts` is also server-only (it
reads `~/.hermes/honcho.json` for the Honcho API key). Pure logic extracted for reuse/testing
(`lib/sse.ts`, `lib/hermesAuth.ts`, `lib/schemas.ts`, `lib/types.ts`) deliberately omits
`"server-only"`. The browser only ever
sees the redacted views: `toPublic` (providers) and `toPublicConnection` (Hermes), which
strip secrets down to a boolean `hasKey`/`hasToken`. `lib/types.ts` is framework-agnostic
and shared by both sides.

### UI

The app uses a **chamber navigation** pattern — five chambers in the sidebar, each with
subsections that act as main tabs. Chamber routing lives in `app/page.tsx`; per-chamber
view components (e.g `CommandView`, `LibraryView`) route by subsection string.

| Chamber | Subsection(s) | View component | Purpose |
|---------|---------------|----------------|---------|
| Dialogue | (conversation list) | inline in `page.tsx` | Chat with providers |
| Studio | — | placeholder | Not yet built |
| Library | Sanctum | `LibraryView` → `SanctumView` | Journaling |
| Council | — | placeholder | Not yet built |
| Command | Connectors, Sessions, Models, Cron, **Memory**, Voice, Channels, Keys | `CommandView` | Hermes control |

> The Command chamber now includes a built **Memory** subsection (not a placeholder) that
> surfaces a self-hosted [Honcho](https://honcho.dev) dashboard. See **Honcho dashboard**
> below.

`components/chambers.ts` holds the metadata (chamber list + per-chamber subsections) and
`firstSubsection(chamber)`. Selecting a chamber resolves `subsection` to its first subsection
(`onSelectChamber` in `page.tsx`), so Library lands on Sanctum / Command on Connectors rather
than a stale or placeholder tab; chambers with no subsections (Dialogue, not-yet-built ones)
leave `subsection` untouched. `subsection` is a single shared state across chambers.
`components/ChamberPlaceholder.tsx` renders the generic "not yet built" state.

### Honcho dashboard (`Command → Memory`)

Honcho is the long-term memory layer for the Hermes ecosystem — it stores per-peer
explicit observations, inductive patterns, and curated peer cards across sessions. The
dashboard gives the user a window into what's actually in Honcho without SSH-ing into
the docker host.

- `app/api/honcho-proxy/[...path]/route.ts` — **catch-all proxy to the Honcho REST API**.
  Reads `~/.hermes/honcho.json` server-side to discover the `baseUrl` (and any
  `apiKey`), then forwards `/v3/...` calls verbatim. Auth credentials never reach the
  browser. The proxy handles 204/205/304 (no body) explicitly because `new Response("")`
  throws on those statuses.
- `app/api/honcho-proxy/config/route.ts` — sanitized Honcho config endpoint. Returns
  the workspace name, peer names, recall mode, cadence, observation mode, and host
  list, but strips `apiKey`. Config is cached on disk for 30s (TTL) since
  `~/.hermes/honcho.json` only changes when `hermes honcho setup` runs.
- `lib/honchoConfig.ts` — **server-only** helper. `readHonchoConfig()` searches
  `$HERMES_HOME/honcho.json`, then `~/.hermes/honcho.json`, then `~/.honcho/config.json`.
  `toPublicConfig()` produces the redacted browser view.
- `lib/honchoClient.ts` — browser-side typed client. Every method goes through the
  proxy. Methods cover peers (`listPeers`, `getPeerContext`), sessions (`listSessions`,
  `getSessionMessages`), queue (`queueStatus`), and dreams (`scheduleDream`).
- `components/HonchoDashboard.tsx` — the tabbed shell: Overview (status + recent
  peers/sessions), Peers (with on-demand peer-card expansion), Sessions, **Logs** (live
  queue status + recent ingestions with auto-refresh toggle, 5s polling), Dreams
  (manual dream scheduling). Subcomponents: `PeerRow`, `PeerContextView`, `SessionRow`,
  `PeerRow` / `SessionRow` / `QueuePanel` / `IngestionsPanel` and helpers are
  `Stat`, `StatusDot`, `EmptyState`, `ErrorState`, `TabBar`, `OverviewTab`,
  `PeersTab`, `SessionsTab`, `DreamsTab`.
- `components/HonchoLogsTab.tsx` — the Logs tab. Auto-refresh polls every 5s when the
  checkbox is on. Recent-ingestions view pulls the 5 most-recent sessions and shows the
  last 4 messages from each, sorted by `created_at`. Uses `honchoAgo` and
  `honchoFmtTime` from the dashboard for consistent time formatting.

This is a **third plane** alongside the inference and Hermes-management planes — the
Honcho REST API (`/v3/*` upstream) has its own base URL (typically
`http://homelab-lan:8000`, **not** the Hermes 9119 admin URL) and its own auth
(`Authorization: Bearer <key>` from honcho.json if present). Conflating it with the
Hermes management plane is the most common mistake here.

**Connectors** (`Command → Connectors`):
- `components/ConnectorsView.tsx` — CRUD UI for connector resources
- `lib/resourceConnectors.ts` — server-side store + validation (filesystem checks for vault paths)
- Currently supports `obsidian-vault` type; extensible to MCP servers, TTRPG tools, etc.

**Sanctum** (`Library → Sanctum`):
- `components/SanctumView.tsx` — journal UI: entry list sidebar + markdown editor + settings.
  Responsive list/detail on mobile (`< md`: list full-width, selecting an entry swaps to a
  full-width editor with a `‹` back button; `md+`: side-by-side).
- `components/MarkdownEditor.tsx` — CodeMirror 6 live-preview editor.
- `lib/sanctum.ts` — server-side entry CRUD + settings persistence + word-count cache.
- `date-fns` for filename templating (e.g. `yyyy.MM.dd`) and date parsing.

Live preview (`MarkdownEditor.tsx`) is driven off the **Lezer markdown syntax tree**
(`syntaxTree` + `@codemirror/lang-markdown`), NOT regex. For each formatting node in the
visible viewport it styles the content and HIDES the syntax markers with a zero-width
`Decoration.replace` (so cursor mapping stays correct), revealing markers only when a
selection actually overlaps that **span** (span-scoped, not line-scoped — headings, quotes,
HR and list bullets reveal at line scope since the marker is the line's prefix). Decorations
are viewport-scoped, rebuilt only on `docChanged || viewportChanged || selectionSet`, and
fed through a `RangeSetBuilder` sorted by `(from, startSide)`. Unordered list markers render
as a real `•` bullet widget; HR renders as a drawn rule. We deliberately do NOT load
`oneDark` or `syntaxHighlighting` — they'd fight the parchment writing surface. `Mod-b`/`i`
etc. "jump out" past a closing marker on a second press (Obsidian/word-processor muscle
memory) and unwrap an already-wrapped selection.

- YAML frontmatter is stripped from the editing surface but preserved across saves
  (`frontmatterRef`, re-attached on every change).
- The entry **title** is NOT stored in the file. It's derived Niphates-side from the filename
  via `deriveTitle`/`parseEntryDate` (parses the filename against `filenameTemplate`; falls
  back to the bare filename if it doesn't parse). Rendered as an inline H1 **block widget** at
  doc position 0 inside the editor column (display-only, never editable/saved), and in the
  sidebar/header. The sidebar is ordered by this parsed date (newest first; undated notes
  sort after, by mtime).
- New entries seed **empty**; `POST /api/sanctum/entries` is **idempotent** — it creates
  today's note if absent, else returns the existing filename (200), so "+ NEW" opens today's
  note rather than 409-ing.
- `wordGoal` (in `data/sanctum.json`) drives: a thin floating progress bar at the editor
  bottom, a subtle bottom-left word count, a per-calendar-day **heatmap** above the file list
  (one cell per day from the first dated entry to today; empty for days with no entry; tinted
  by `wordCount/goal`), and a gold tint + `✦` on entries that met the goal. `countEntryWords`
  (server) mirrors the client `countWords` so list/heatmap and live counts agree. Both strip
  frontmatter and markdown punctuation. **Gold tints use inline `color-mix`, NOT Tailwind
  `bg-gold/<opacity>`** — `--gold` is a bare hex with no `<alpha-value>` channel in the
  config, so opacity modifiers silently no-op (a known footgun here).
- **Word-count cache** (`lib/sanctum.ts`, `data/sanctum-wordcounts.json`, git-ignored): since
  `listEntries` now reads every file to count words and the heatmap spans every day, counts
  are cached per file keyed by `(connector folder name)`, validated against `(mtimeMs, size)`.
  A write changes mtime so stale entries self-invalidate — no explicit invalidation. Cache is
  namespaced per journal and pruned only within the active namespace; the persist `update()`
  is gated so the all-cache-hit path does no write.
- Entry filenames are resolved via `resolveEntryPath` (basename + containment check) — it
  defends against path traversal WITHOUT mangling legitimate names (the old `sanitizeFilename`
  rewrote spaces/apostrophes to `_`, 404-ing non-date-named entries).
- Auto-save on every keystroke (800ms debounce).
- The editor caret is gold (`--gold`); on mobile a `visualViewport` resize listener pulls the
  caret back into view when the keyboard opens. (iOS WebKit — including "Chrome" on iOS —
  doesn't honour `interactiveWidget: resizes-content`, so this is best-effort there.)
- Keyboard shortcuts: `Mod-b` bold, `Mod-i` italic, `Mod-k` link, `Mod-\`` code,
  `Mod-Shift-1/2/3` headings, `Mod-Shift-.` blockquote, `Mod-l` list, `Mod-o` ordered list,
  `Mod-Shift-s` strikethrough

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
- **IMPORTANT**: `lib/connectors.ts` (chat wire adapters — OpenAI/Anthropic streams) and
  `lib/resourceConnectors.ts` (connector resource registry — vaults/tools) are **two
  completely different files with similar names**. Do not confuse them. Chat connectors
  handle streaming HTTP → text fragments. Resource connectors manage persisted
  configuration entries for external tools/vaults.
- Connector type extensibility: to add a new connector type (e.g. `mcp-server`), add a
  type to `ConnectorType`, a config interface, and a validation branch in
  `validateConnector()` in `lib/resourceConnectors.ts`.

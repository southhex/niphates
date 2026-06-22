# Model Management — Design

Date: 2026-06-22
Status: Approved (brainstorm) → ready for implementation plan

## Problem

Two gaps stop Niphates from being a daily driver:

1. **No real control over which model answers.** The composer picker is a
   hand-typed, comma-separated list stored per provider (`data/providers.json`,
   edited in Settings). For Hermes it is just `["hermes-agent"]`. You cannot pick
   from the models a provider actually serves, and you cannot control the model
   Hermes thinks with.
2. **No way to curate the picker.** Providers like Local (Ollama, 7 models) or a
   Hermes upstream (Kilo Gateway, 337 models) expose far more than you want in a
   dropdown. There is no toggle to decide which models reach the picker.

## Findings from probing the live Hermes instance

These shaped the design and must not be re-derived.

- **Hermes inference `/v1/models` (port 8642) lists _profiles_, not LLMs.** It
  returned `[{ id: "Michael's Agent" }]`. The OpenAI `model` field on
  `/v1/chat/completions` is therefore a **profile name**, not a model id. The
  current `providers.json` value `"hermes-agent"` is a stale default string.
- **The underlying LLM behind a profile is a management-plane setting.**
  `GET /api/model/info` (port 9119) returned `deepseek/deepseek-v4-flash` via
  `openrouter`. This endpoint is **unauthenticated** (works with no header).
- **The model catalog + switching require a session token, not the bearer.**
  `/api/model/options`, `/api/model/set`, `/api/config`, `/api/system/stats`
  all returned **401** with the configured bearer. The Hermes dashboard SPA
  authenticates the management plane with header **`X-Hermes-Session-Token`**
  (value injected into the page as `window.__HERMES_SESSION_TOKEN__`). There is
  no password-login endpoint — the token is pre-provisioned on the Hermes server.
  A confirmed-working session token unlocked `/model/options` and `/model/info`
  (but not `/auth/me` — that wants a user session, which we do not need).
- **`/api/model/options` shape** (the switchable LLM catalog):
  ```jsonc
  {
    "model": "deepseek/deepseek-v4-flash",   // active LLM
    "provider": "openrouter",                 // active upstream
    "providers": [
      {
        "slug": "openrouter", "name": "OpenRouter", "is_current": true,
        "models": ["..."], "total_models": 28,
        "pricing": { "<model>": { "input": "$1.60", "output": "$3.20", "cache": "$0.14", "free": false } },
        "unavailable_models": ["..."], "free_tier": true,
        "authenticated": true, "capabilities": { ... }, "is_user_defined": false, "source": "hermes"
      }
      // ~38 upstreams; only OpenRouter(28, current), Kilo(337), Nous(25/24 unavail), Anthropic(11), Google(11) populated
    ]
  }
  ```
- `/api/model/set` accepts `{ model, provider }` (already wired in `hermesClient`).

### Architectural consequence

The hybrid the user wants maps cleanly onto the two planes:

- **Composer picks a _profile_** (inference plane, existing bearer, per-conversation).
- **Command switches the active profile's _underlying LLM_** (management plane,
  session-token-gated, **global server-side state**).

The global-state nature of the LLM switch is inherent to Hermes and will be made
explicit in the UI, not hidden.

## Shared data model change

`Provider` (`lib/types.ts`) and `providerSchema` (`lib/schemas.ts`):

- **Add `catalog?: string[]`** — last-discovered full list of model ids, cached on disk.
- **Repurpose `models: string[]`** as the **enabled** subset shown in the composer
  picker. Same field; clarified meaning (was "hand-typed list").
- **Add `catalogUpdatedAt?: number`** — epoch ms of the last discovery, for a
  "discovered N ago" label.

Backward compatible: until a provider is discovered, `catalog` is undefined and
the existing `models` array still feeds the picker. No migration step. The
redacted `PublicProvider` (`toPublic`) gains `catalog` and `catalogUpdatedAt`.

Hermes needs **no special-casing** in discovery: `GET ${baseUrl}/models` returns
profiles for Hermes, so discovering it populates `catalog` with profile names
(`"Michael's Agent"`), which the user enables; chat then sends the profile name
and the stale `"hermes-agent"` is naturally replaced.

## Block 1 — Hermes session-token auth

Small; prerequisite for Block 3.

- Add `"session"` to `HermesAuthMode` (`lib/hermesAuth.ts`), to
  `hermesAuthModeSchema` (`lib/schemas.ts`), and to the Command auth-mode `<select>`
  (`components/CommandView.tsx`).
- `authHeaders()` in `hermesAuth.ts`: when resolved mode is `session`, return
  `{ "X-Hermes-Session-Token": conn.token }`. `auto` resolution is unchanged
  (loopback → none, else bearer); `session` must be chosen explicitly. Add a help
  line in the Command form noting Hermes's management plane needs `session`.
- **Fix the connection test** (`app/api/hermes/connection/test/route.ts`): it
  currently probes only `/api/model/info`, which is unauthenticated — a bad token
  reports "connected." New behavior: after the reachability probe, also probe an
  authed endpoint (`/api/model/options`) and report **reachable vs authenticated**
  separately (e.g. `{ ok, reachable, authenticated, model, provider }`). Surface
  this in the Command status line.
- Update `.env.example`: document `session` and the `X-Hermes-Session-Token`
  header under `HERMES_ADMIN_AUTH`.
- Secret handling: the session token lives in `data/hermes.json` (gitignored) and
  may seed from `HERMES_ADMIN_TOKEN`. Never logged, never returned raw
  (`toPublicConnection` already redacts to `hasToken`).

**Test:** extend `tests/hermesAuth.test.ts` — `authHeaders` emits the session
header for `authMode: "session"` with a token, and emits nothing when token absent.

## Block 2 — Model discovery + curation (all providers)

Medium; delivers point 2.

### Server

- **New `POST /api/providers/discover`** `{ providerId }`:
  - Reads the provider server-side (`getProvider`), calls
    `GET ${baseUrl}/models` with the stored API key (same call the existing
    `app/api/providers/test/route.ts` already makes — extract the id-extraction
    into a shared helper to avoid duplication).
  - On success: writes `catalog` + `catalogUpdatedAt` via `upsertProvider`,
    returns `{ catalog, catalogUpdatedAt }`.
  - Anthropic-type providers have no list endpoint → return
    `{ catalog: null, note: "Anthropic has no model-list endpoint; edit models in Settings." }`.
- **New `PATCH /api/providers/[id]/models`** `{ models: string[] }`:
  - Updates **only** `models` (and leaves `catalog`/secrets untouched) via
    `upsertProvider`. A dedicated minimal route so curation can never clobber the
    API key — distinct from the full-object `POST /api/providers` used by Settings.
  - Validates with a small zod schema (`z.object({ models: z.array(z.string()) })`).

### UI — Command "MODELS" section

New section in `components/CommandView.tsx` (or a child component
`components/ModelCuration.tsx` for focus), rendered for **every** provider from
`GET /api/providers`:

- Per provider row group: provider name · `(N of M enabled)` · **DISCOVER** button
  · "discovered <relative time>" (from `catalogUpdatedAt`).
- Toggle list over `catalog`: each model id with a switch; toggling updates the
  enabled set and PATCHes `models` (debounced or on-commit).
- Empty state (no `catalog` yet): "Discover to populate." For anthropic-type:
  show the note and link to Settings.
- The composer picker (`app/page.tsx` → `Composer`) continues to read
  `currentProvider.models`; no change there beyond `models` now being the curated set.

## Block 3 — Hybrid Hermes underlying-LLM control

Medium; delivers point 1's "any model available to Hermes."

- **Tighten `ModelOptions`** in `lib/hermesClient.ts` to the real shape (see
  Findings): `{ model, provider, providers: HermesUpstream[] }` where
  `HermesUpstream = { slug, name, is_current, models: string[], total_models,
  pricing: Record<string, { input, output, cache, free }>, unavailable_models:
  string[], free_tier, authenticated }`.
- **New `components/HermesModelCatalog.tsx`** rendered in Command's existing
  "MODEL" section (the generic `Select` cannot do grouped/search/pricing):
  - Header: active LLM from `/model/info` — e.g. `deepseek-v4-flash · openrouter`.
  - **Search box** filtering across all upstreams (Kilo has 337 models).
  - Models **grouped by upstream** (only `total_models > 0`), collapsible.
  - Each row: model id + **pricing** (input/output $); rows in `unavailable_models`
    are greyed and non-selectable; the active model is marked.
  - Selecting a row → `hermesApi.setModel(model, slug)` → refresh `/model/info`.
- **Disambiguation copy** in the section: "The composer picks which profile
  answers; here you set the model that profile thinks with. This is a global
  Hermes setting — it changes the model for every chat against this profile."

## Out of scope (YAGNI)

- Hermes profile CRUD (create/rename/delete profiles) — we use the existing
  default profile; profiles are managed inside Hermes itself.
- Per-conversation underlying-LLM for Hermes — not possible without per-request
  profile mapping; the profile (composer) is the per-conversation unit.
- A separate `data/models.json` registry — curation lives on the provider record.
- Anthropic model discovery — no upstream list endpoint; stays manual.

## Sequencing

Three phases, each independently shippable, in order:

1. **Block 1** — session auth (unblocks the catalog endpoints).
2. **Block 2** — discovery + curation (delivers the toggle for all providers).
3. **Block 3** — Hermes hybrid catalog (delivers full Hermes model control).

## Files touched (anticipated)

- `lib/types.ts`, `lib/schemas.ts` — `catalog`/`catalogUpdatedAt`, `session` mode.
- `lib/hermesAuth.ts`, `tests/hermesAuth.test.ts` — session header + tests.
- `lib/providers.ts` — `toPublic` exposes new fields; shared model-id helper.
- `app/api/hermes/connection/test/route.ts` — auth-aware test.
- `app/api/providers/discover/route.ts` (new), `app/api/providers/[id]/models/route.ts` (new).
- `lib/hermesClient.ts` — tightened `ModelOptions`.
- `components/CommandView.tsx`, `components/ModelCuration.tsx` (new),
  `components/HermesModelCatalog.tsx` (new).
- `.env.example` — document `session` auth mode.

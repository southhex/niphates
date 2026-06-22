# Model Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Niphates real model control — discover the models each provider actually serves, toggle which reach the composer picker, and switch the Hermes profile's underlying LLM from its full catalog.

**Architecture:** Three phases on the two existing planes. (1) Add a `session` Hermes management-auth mode (`X-Hermes-Session-Token`) to unlock the catalog endpoints. (2) Add per-provider model discovery (`GET ${baseUrl}/models`) cached on the provider record, with a curation toggle UI in the Command chamber; the composer picker reads the curated `models` array. (3) A bespoke Hermes catalog component (search + grouping + pricing) that switches the active profile's underlying LLM via `/api/model/set`.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind, zod 3, vitest 2.

**Branch:** `feat/model-management` (already created; spec committed there).

**Reference spec:** `docs/superpowers/specs/2026-06-22-model-management-design.md`

---

## File Structure

**Phase 1 — session auth**
- Modify `lib/hermesAuth.ts` — add `session` to `HermesAuthMode`; emit `X-Hermes-Session-Token`.
- Modify `lib/schemas.ts` — add `session` to `hermesAuthModeSchema`.
- Modify `tests/hermesAuth.test.ts` — session header cases.
- Modify `app/api/hermes/connection/test/route.ts` — authenticated-vs-reachable probe.
- Modify `components/CommandView.tsx` — `session` option + auth-aware status.
- Modify `.env.example` — document `session`.

**Phase 2 — discovery + curation**
- Create `lib/modelDiscovery.ts` — pure `extractModelIds` helper.
- Create `tests/modelDiscovery.test.ts` — unit tests.
- Modify `app/api/providers/test/route.ts` — use the shared helper (DRY).
- Modify `lib/types.ts` — `catalog` / `catalogUpdatedAt` on `Provider` + `PublicProvider`.
- Modify `lib/schemas.ts` — `catalog` / `catalogUpdatedAt` on `providerSchema`.
- Modify `lib/providers.ts` — `toPublic` exposes the new fields.
- Create `app/api/providers/discover/route.ts` — discover + cache catalog.
- Create `app/api/providers/[id]/models/route.ts` — PATCH only `models`.
- Create `components/ModelCuration.tsx` — per-provider toggle UI.
- Modify `components/CommandView.tsx` — render `<ModelCuration />`.

**Phase 3 — Hermes hybrid catalog**
- Modify `lib/hermesClient.ts` — tighten `ModelOptions` to the real shape.
- Create `components/HermesModelCatalog.tsx` — grouped/searchable/priced catalog.
- Modify `components/CommandView.tsx` — replace the flat model `<select>`; add disambiguation copy.

No change needed in `app/page.tsx` / `components/Composer.tsx`: the picker already reads `currentProvider.models`, which becomes the curated set automatically.

---

# Phase 1 — Hermes session-token auth

### Task 1: Add the `session` auth mode

**Files:**
- Modify: `lib/hermesAuth.ts`
- Modify: `lib/schemas.ts:36`
- Test: `tests/hermesAuth.test.ts`

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe("authHeaders", ...)` block in `tests/hermesAuth.test.ts`:

```ts
  it("session: sends the X-Hermes-Session-Token header", () => {
    expect(
      authHeaders({
        adminBaseUrl: "http://100.127.15.14:9119",
        authMode: "session",
        token: "tok",
      }),
    ).toEqual({ "X-Hermes-Session-Token": "tok" });
  });

  it("session: sends nothing without a token", () => {
    expect(
      authHeaders({
        adminBaseUrl: "http://100.127.15.14:9119",
        authMode: "session",
      }),
    ).toEqual({});
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/hermesAuth.test.ts`
Expected: the two new tests FAIL (session yields `{}` today because the mode is unhandled).

- [ ] **Step 3: Add `session` to the type and header resolver**

In `lib/hermesAuth.ts`, change the type (line 6):

```ts
export type HermesAuthMode = "auto" | "none" | "bearer" | "cookie" | "session";
```

Update the doc comment for `authMode` to add the line:
```
   * - "session": X-Hermes-Session-Token: <token>  (Hermes dashboard session token)
```

In `authHeaders`, add the session branch before the final `return {}` (after the cookie line):

```ts
  if (mode === "cookie") return { Cookie: conn.token };
  if (mode === "session") return { "X-Hermes-Session-Token": conn.token };
  return {};
```

- [ ] **Step 4: Add `session` to the schema enum**

In `lib/schemas.ts` line 36:

```ts
export const hermesAuthModeSchema = z.enum([
  "auto",
  "none",
  "bearer",
  "cookie",
  "session",
]);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/hermesAuth.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/hermesAuth.ts lib/schemas.ts tests/hermesAuth.test.ts
git commit -m "feat(hermes): add session auth mode (X-Hermes-Session-Token)"
```

---

### Task 2: Make the connection test verify auth, not just reachability

`/api/model/info` is unauthenticated, so today a wrong token still reports "connected." Probe an authed endpoint too.

**Files:**
- Modify: `app/api/hermes/connection/test/route.ts`

- [ ] **Step 1: Replace the POST body**

Replace the whole `export async function POST()` in `app/api/hermes/connection/test/route.ts` with:

```ts
export async function POST() {
  const conn = await getHermesConnection();
  const loopback = isLoopbackUrl(conn.adminBaseUrl);

  try {
    // /model/info is unauthenticated — proves reachability, not auth.
    const infoRes = await hermesFetch("/api/model/info", { timeoutMs: 8000 });
    if (!infoRes.ok) {
      const detail = await infoRes.text().catch(() => "");
      return Response.json({
        ok: false,
        reachable: false,
        status: infoRes.status,
        error: `HTTP ${infoRes.status}: ${detail.slice(0, 200)}`,
      });
    }
    const info = await infoRes.json().catch(() => ({}));

    // /model/options requires a valid session token — use it to confirm auth.
    const optRes = await hermesFetch("/api/model/options", { timeoutMs: 8000 });
    const authenticated = optRes.status !== 401 && optRes.status !== 403;

    return Response.json({
      ok: true,
      reachable: true,
      authenticated,
      loopback,
      model: info?.model ?? info?.current ?? null,
      provider: info?.provider ?? null,
    });
  } catch (err) {
    return Response.json({ ok: false, reachable: false, error: hermesError(err) });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify against the live instance**

Ensure dev server is running (`npm run dev`), then in `data/hermes.json` set `authMode: "session"` and `token` to a valid session token, and:

Run: `curl -s -X POST http://localhost:3000/api/hermes/connection/test`
Expected: JSON with `"reachable":true` and `"authenticated":true`. Then set a bogus token and re-run — expect `"authenticated":false`.

- [ ] **Step 4: Commit**

```bash
git add app/api/hermes/connection/test/route.ts
git commit -m "feat(hermes): connection test reports authenticated vs reachable"
```

---

### Task 3: Surface `session` in the Command UI + docs

**Files:**
- Modify: `components/CommandView.tsx`
- Modify: `.env.example`

- [ ] **Step 1: Add the `session` option to the auth-mode select**

In `components/CommandView.tsx`, inside the auth-mode `<select>` (after the `cookie` option), add:

```tsx
              <option value="session">session (X-Hermes-Session-Token)</option>
```

- [ ] **Step 2: Use the new test result fields in the status line**

In `onSaveAndTest`, replace the success branch (`if (t.ok) { ... }`) with:

```ts
    if (t.ok) {
      setConnected(true);
      setStatus(
        t.authenticated
          ? `✅ Connected & authenticated. Current model: ${t.model ?? "?"}`
          : `⚠️ Reachable but NOT authenticated — set authMode "session" + a valid token. Current model: ${t.model ?? "?"}`,
      );
      await refreshLive();
    } else {
```

- [ ] **Step 3: Widen the `ConnectionTest` type**

In `lib/hermesClient.ts`, add the two new optional fields to `ConnectionTest`:

```ts
export interface ConnectionTest {
  ok: boolean;
  reachable?: boolean;
  authenticated?: boolean;
  loopback?: boolean;
  model?: string | null;
  provider?: string | null;
  status?: number;
  error?: string;
}
```

- [ ] **Step 4: Add a help line under the auth select**

In `components/CommandView.tsx`, immediately after the closing `</label>` of the "Auth mode" field, add:

```tsx
          <p className="col-span-1 -mt-1 font-mono text-[10.5px] text-mutedlo sm:col-span-2">
            Hermes&apos;s management API (model catalog, model switching) requires
            <span className="text-parch"> session</span> mode.
          </p>
```

- [ ] **Step 5: Document `session` in `.env.example`**

Replace the `HERMES_ADMIN_AUTH` comment line:

```
# auto | none | bearer | cookie | session  (session = X-Hermes-Session-Token; needed for the model catalog & switching)
```

- [ ] **Step 6: Typecheck + visual check**

Run: `npx tsc --noEmit`
Expected: no errors. Then open `http://localhost:3000`, go to the Command chamber, confirm the auth dropdown shows "session" and the help line renders.

- [ ] **Step 7: Commit**

```bash
git add components/CommandView.tsx lib/hermesClient.ts .env.example
git commit -m "feat(command): expose session auth mode + auth-aware connection status"
```

---

# Phase 2 — Model discovery + curation

### Task 4: Pure model-id extraction helper

**Files:**
- Create: `lib/modelDiscovery.ts`
- Test: `tests/modelDiscovery.test.ts`
- Modify: `app/api/providers/test/route.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/modelDiscovery.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { extractModelIds } from "../lib/modelDiscovery";

describe("extractModelIds", () => {
  it("pulls ids from an OpenAI /models payload", () => {
    expect(
      extractModelIds({ data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] }),
    ).toEqual(["gpt-4o", "gpt-4o-mini"]);
  });

  it("handles Hermes profiles (same shape, spaced names)", () => {
    expect(
      extractModelIds({ object: "list", data: [{ id: "Michael's Agent" }] }),
    ).toEqual(["Michael's Agent"]);
  });

  it("tolerates string entries and drops empties", () => {
    expect(extractModelIds({ data: ["a", { id: "" }, { id: "b" }] })).toEqual([
      "a",
      "b",
    ]);
  });

  it("returns [] for non-list payloads", () => {
    expect(extractModelIds({})).toEqual([]);
    expect(extractModelIds(null)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/modelDiscovery.test.ts`
Expected: FAIL — `Failed to resolve import "../lib/modelDiscovery"`.

- [ ] **Step 3: Implement the helper**

Create `lib/modelDiscovery.ts`:

```ts
// Pure helper: extract model ids from an OpenAI-compatible GET /models
// response. No "server-only" — shared by the test + discover routes and
// unit-testable. Hermes returns the same shape, where each id is a profile.

interface OpenAIModelsResponse {
  data?: Array<{ id?: string } | string>;
}

export function extractModelIds(json: unknown): string[] {
  const data = (json as OpenAIModelsResponse | null)?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((m) => (typeof m === "string" ? m : m?.id ?? ""))
    .filter((id): id is string => Boolean(id));
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/modelDiscovery.test.ts`
Expected: PASS.

- [ ] **Step 5: DRY the test route onto the helper**

In `app/api/providers/test/route.ts`, add the import:

```ts
import { extractModelIds } from "@/lib/modelDiscovery";
```

Replace the inline extraction:

```ts
    const json = await res.json().catch(() => ({}));
    const models: string[] = Array.isArray(json?.data)
      ? json.data.map((m: { id: string }) => m.id).filter(Boolean)
      : [];
    return Response.json({ ok: true, models });
```

with:

```ts
    const json = await res.json().catch(() => ({}));
    return Response.json({ ok: true, models: extractModelIds(json) });
```

- [ ] **Step 6: Typecheck + full test run**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/modelDiscovery.ts tests/modelDiscovery.test.ts app/api/providers/test/route.ts
git commit -m "feat(providers): shared extractModelIds helper; reuse in test route"
```

---

### Task 5: Add `catalog` / `catalogUpdatedAt` to the provider model

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/schemas.ts:23-34`
- Modify: `lib/providers.ts:139-150`

- [ ] **Step 1: Extend the `Provider` interface**

In `lib/types.ts`, inside `interface Provider`, after the `models` field add:

```ts
  /** Full set of model ids last discovered from the provider (cached). */
  catalog?: string[];
  /** Epoch ms of the last successful discovery. */
  catalogUpdatedAt?: number;
```

- [ ] **Step 2: Extend `PublicProvider`**

In `lib/types.ts`, inside `interface PublicProvider`, after `models` add:

```ts
  catalog?: string[];
  catalogUpdatedAt?: number;
```

- [ ] **Step 3: Extend `providerSchema`**

In `lib/schemas.ts`, inside `providerSchema` (after the `models` line):

```ts
  catalog: z.array(z.string()).optional(),
  catalogUpdatedAt: z.number().optional(),
```

- [ ] **Step 4: Expose the fields in `toPublic`**

In `lib/providers.ts`, in `toPublic`, after `models: p.models,` add:

```ts
    catalog: p.catalog,
    catalogUpdatedAt: p.catalogUpdatedAt,
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/schemas.ts lib/providers.ts
git commit -m "feat(providers): add catalog + catalogUpdatedAt to provider model"
```

---

### Task 6: Discovery endpoint

**Files:**
- Create: `app/api/providers/discover/route.ts`

- [ ] **Step 1: Implement the route**

Create `app/api/providers/discover/route.ts`:

```ts
// Discover the full model catalog a provider serves (OpenAI-compatible
// GET /models), cache it on the provider record, and return it. Hermes
// returns its profiles here. Anthropic-type has no list endpoint.

import { NextRequest } from "next/server";
import { getProvider, upsertProvider } from "@/lib/providers";
import { extractModelIds } from "@/lib/modelDiscovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { providerId } = (await req.json().catch(() => ({}))) as {
    providerId?: string;
  };
  if (!providerId) {
    return Response.json({ error: "providerId required" }, { status: 400 });
  }
  const provider = await getProvider(providerId);
  if (!provider) {
    return Response.json({ error: "Unknown provider" }, { status: 404 });
  }
  if (provider.type === "anthropic") {
    return Response.json({
      catalog: null,
      note: "Anthropic has no model-list endpoint; edit models in Settings.",
    });
  }

  const url = `${provider.baseUrl.replace(/\/$/, "")}/models`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: provider.apiKey
        ? { Authorization: `Bearer ${provider.apiKey}` }
        : {},
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return Response.json(
        { error: `HTTP ${res.status}: ${detail.slice(0, 200)}` },
        { status: 502 },
      );
    }
    const json = await res.json().catch(() => ({}));
    const catalog = extractModelIds(json);
    const catalogUpdatedAt = Date.now();
    await upsertProvider({ ...provider, catalog, catalogUpdatedAt });
    return Response.json({ catalog, catalogUpdatedAt });
  } catch (err) {
    clearTimeout(t);
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify against a reachable provider**

With the dev server running:

Run: `curl -s -X POST http://localhost:3000/api/providers/discover -H 'Content-Type: application/json' -d '{"providerId":"local"}'`
Expected: `{"catalog":["qwen3:14b", ...], "catalogUpdatedAt": <number>}`. Confirm `data/providers.json` now has a `catalog` array on the `local` provider. (Use `hermes` if `local` is unreachable — expect its profile id, e.g. `"Michael's Agent"`.)

- [ ] **Step 4: Commit**

```bash
git add app/api/providers/discover/route.ts
git commit -m "feat(providers): POST /api/providers/discover caches the served catalog"
```

---

### Task 7: Curation PATCH endpoint

**Files:**
- Create: `app/api/providers/[id]/models/route.ts`

- [ ] **Step 1: Implement the route**

Create `app/api/providers/[id]/models/route.ts`:

```ts
// Update ONLY the enabled `models` array for a provider — the set shown in the
// composer picker. A dedicated minimal route so curation can never touch the
// stored apiKey (unlike the full-object POST /api/providers).

import { NextRequest } from "next/server";
import { z } from "zod";
import { getProvider, upsertProvider, toPublic } from "@/lib/providers";
import { formatZodError } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ models: z.array(z.string()) });

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: formatZodError(parsed.error) }, { status: 400 });
  }
  const provider = await getProvider(id);
  if (!provider) {
    return Response.json({ error: "Unknown provider" }, { status: 404 });
  }
  const all = await upsertProvider({ ...provider, models: parsed.data.models });
  return Response.json({ providers: all.map(toPublic) });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify it updates only `models` and preserves the key**

With the dev server running:

Run: `curl -s -X PATCH http://localhost:3000/api/providers/local/models -H 'Content-Type: application/json' -d '{"models":["qwen3:8b"]}'`
Expected: `{"providers":[...]}` with `local.models === ["qwen3:8b"]`. Confirm in `data/providers.json` that `local.apiKey` (and `hermes.apiKey`) are untouched and `catalog` is still present.

- [ ] **Step 4: Commit**

```bash
git add "app/api/providers/[id]/models/route.ts"
git commit -m "feat(providers): PATCH /api/providers/:id/models for picker curation"
```

---

### Task 8: Curation UI in the Command chamber

**Files:**
- Create: `components/ModelCuration.tsx`
- Modify: `components/CommandView.tsx`

- [ ] **Step 1: Build the component**

Create `components/ModelCuration.tsx`:

```tsx
// components/ModelCuration.tsx
"use client";

import { useEffect, useState } from "react";
import type { PublicProvider } from "@/lib/types";

function relTime(ts?: number): string {
  if (!ts) return "never";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function ModelCuration() {
  const [providers, setProviders] = useState<PublicProvider[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = () =>
    fetch("/api/providers")
      .then((r) => r.json())
      .then((d) => setProviders(d.providers as PublicProvider[]));

  useEffect(() => {
    load();
  }, []);

  const discover = async (id: string) => {
    setBusy(id);
    setNote("");
    const res = await fetch("/api/providers/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId: id }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setNote(`❌ ${d.error || "discover failed"}`);
      return;
    }
    if (d.catalog === null) setNote(d.note || "No discovery for this provider.");
    await load();
  };

  const toggle = async (p: PublicProvider, model: string) => {
    const enabled = new Set(p.models);
    if (enabled.has(model)) enabled.delete(model);
    else enabled.add(model);
    const models = (p.catalog ?? []).filter((m) => enabled.has(m));
    setProviders((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, models } : x)),
    );
    await fetch(`/api/providers/${encodeURIComponent(p.id)}/models`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ models }),
    });
  };

  return (
    <section className="mb-4 border border-hair bg-paneldk p-4">
      <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
        ⌁ MODELS
      </div>
      <p className="mb-4 font-mono text-[12px] text-parch">
        Choose which models appear in the composer picker. Discover pulls the
        full list a provider serves; toggle the ones you want.
      </p>
      {note && (
        <div className="mb-3 break-words border border-hair bg-panel px-3 py-2 font-mono text-[12px] text-parch">
          {note}
        </div>
      )}
      <div className="space-y-5">
        {providers.map((p) => {
          const enabled = new Set(p.models);
          const catalog = p.catalog ?? [];
          return (
            <div key={p.id}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[13px] text-marble">
                  {p.name}
                </span>
                <span className="font-mono text-[11px] text-muted">
                  ({p.models.length} of {catalog.length} enabled)
                </span>
                <span className="font-mono text-[11px] text-mutedlo">
                  · discovered {relTime(p.catalogUpdatedAt)}
                </span>
                <button
                  onClick={() => discover(p.id)}
                  disabled={busy === p.id}
                  className="ml-auto border border-hair px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-parch hover:border-lapis hover:text-lapis disabled:opacity-40"
                >
                  {busy === p.id ? "…" : "DISCOVER"}
                </button>
              </div>
              {catalog.length === 0 ? (
                <p className="font-mono text-[11px] text-mutedlo">
                  {p.type === "anthropic"
                    ? "No model-list endpoint — edit models in Settings."
                    : "Discover to populate the catalog."}
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {catalog.map((m) => (
                    <label
                      key={m}
                      className="flex cursor-pointer items-center gap-2 font-mono text-[12px]"
                    >
                      <input
                        type="checkbox"
                        checked={enabled.has(m)}
                        onChange={() => toggle(p, m)}
                        className="accent-gold"
                      />
                      <span className={enabled.has(m) ? "text-marble" : "text-muted"}>
                        {m}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Render it in the Command chamber**

In `components/CommandView.tsx`, add the import at the top:

```tsx
import { ModelCuration } from "@/components/ModelCuration";
```

Then render `<ModelCuration />` immediately **after** the closing `</section>` of the CONNECTION block and **before** the `{connected && (` MODEL section. (Curation is independent of the Hermes management connection — it uses `/api/providers` — so it always shows.)

```tsx
      </section>

      {/* Picker curation — all providers, independent of Hermes connection */}
      <ModelCuration />

      {/* Model section */}
      {connected && (
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Visual verification**

With the dev server running, open the Command chamber. For the `local` provider: click DISCOVER → the catalog list appears with checkboxes; the "(N of M enabled)" count and "discovered just now" update. Toggle a couple, then open the composer model picker (switch the top-bar provider chip to Local) and confirm it shows exactly the enabled set.

- [ ] **Step 5: Commit**

```bash
git add components/ModelCuration.tsx components/CommandView.tsx
git commit -m "feat(command): per-provider model discovery + picker curation UI"
```

---

# Phase 3 — Hermes hybrid underlying-LLM control

### Task 9: Tighten `ModelOptions` and build the catalog component

**Files:**
- Modify: `lib/hermesClient.ts`
- Create: `components/HermesModelCatalog.tsx`
- Modify: `components/CommandView.tsx`

- [ ] **Step 1: Replace the loose `ModelOptions` type**

In `lib/hermesClient.ts`, replace the `ModelInfo` / `ModelOptions` interfaces (the `ModelInfo` interface and the `ModelOptions` interface) with:

```ts
export interface ModelInfo {
  model?: string;
  provider?: string;
  [k: string]: unknown;
}

export interface HermesPricing {
  input?: string;
  output?: string;
  cache?: string | null;
  free?: boolean;
}

export interface HermesUpstream {
  slug: string;
  name: string;
  is_current: boolean;
  models: string[];
  total_models: number;
  unavailable_models: string[];
  free_tier?: boolean;
  authenticated?: boolean;
  pricing?: Record<string, HermesPricing>;
}

export interface ModelOptions {
  model?: string;
  provider?: string;
  providers?: HermesUpstream[];
}
```

> Note: the old `modelIds(opts)` helper in `CommandView.tsx` reads `opts.models`, which no longer exists. It is removed in Step 4.

- [ ] **Step 2: Build the catalog component**

Create `components/HermesModelCatalog.tsx`:

```tsx
// components/HermesModelCatalog.tsx
"use client";

import { useMemo, useState } from "react";
import type { ModelOptions } from "@/lib/hermesClient";

export function HermesModelCatalog({
  options,
  currentModel,
  busyModel,
  onSet,
}: {
  options: ModelOptions | null;
  currentModel: string | null;
  busyModel: string | null;
  onSet: (model: string, provider: string) => void;
}) {
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const ups = (options?.providers ?? []).filter((u) => u.total_models > 0);
    const needle = q.trim().toLowerCase();
    return ups
      .map((u) => ({
        ...u,
        shown: u.models.filter(
          (m) => !needle || m.toLowerCase().includes(needle),
        ),
      }))
      .filter((u) => u.shown.length > 0);
  }, [options, q]);

  if (!options?.providers?.length) {
    return (
      <p className="font-mono text-[12px] text-mutedlo">
        No catalog — connect with a session token to load available models.
      </p>
    );
  }

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="search models…"
        className="hxinp mb-3"
      />
      <div className="max-h-[420px] space-y-4 overflow-y-auto">
        {groups.map((u) => {
          const unavailable = new Set(u.unavailable_models);
          return (
            <div key={u.slug}>
              <div className="mb-1.5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                {u.name}
                {u.is_current && <span className="text-malach">· current</span>}
                <span className="text-mutedlo">{u.shown.length}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                {u.shown.map((m) => {
                  const off = unavailable.has(m);
                  const active = m === currentModel;
                  const price = u.pricing?.[m];
                  return (
                    <button
                      key={m}
                      type="button"
                      disabled={off || active || busyModel === m}
                      onClick={() => onSet(m, u.slug)}
                      className={`flex items-center justify-between gap-3 px-2 py-1.5 text-left font-mono text-[12px] ${
                        active
                          ? "bg-panel text-gold"
                          : off
                            ? "text-mutedlo line-through"
                            : "text-parch hover:bg-panel hover:text-marble"
                      } disabled:cursor-not-allowed`}
                    >
                      <span className="truncate">{m}</span>
                      <span className="shrink-0 text-[10.5px] text-muted">
                        {busyModel === m
                          ? "…"
                          : price?.input && price?.output
                            ? `${price.input}/${price.output}`
                            : off
                              ? "n/a"
                              : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Import the component and add `busyModel` state in CommandView**

In `components/CommandView.tsx`, add the import:

```tsx
import { HermesModelCatalog } from "@/components/HermesModelCatalog";
```

Remove the `modelIds` helper function (the `function modelIds(...) { ... }` block near the top) and the `ModelOptions` import is already present — keep it. Add a `busyModel` state alongside the others:

```tsx
  const [busyModel, setBusyModel] = useState<string | null>(null);
```

Remove the now-unused `pickModel` state and the `available` const (`const available = modelIds(options);`).

- [ ] **Step 4: Replace `onSetModel` to take model + provider**

In `components/CommandView.tsx`, replace the `onSetModel` function with:

```ts
  const onSetModel = async (model: string, provider: string) => {
    if (!model || model === currentModel) return;
    setBusyModel(model);
    setStatus(`Switching to ${model}…`);
    const res = await hermesApi.setModel(model, provider);
    setBusyModel(null);
    if (res.ok) {
      setStatus(`✅ Active model is now ${model}`);
      await refreshLive();
    } else {
      setStatus(`❌ ${res.error}`);
    }
  };
```

- [ ] **Step 5: Replace the MODEL section body**

In `components/CommandView.tsx`, replace the inner content of the `{connected && ( <section> ... </section> )}` MODEL block (everything inside that `<section>` after the `⌁ MODEL` label div) with:

```tsx
          <p className="mb-3 font-mono text-[12px] text-parch">
            Current:{" "}
            <span className="text-gold">{currentModel ?? "unknown"}</span>
            {currentProvider ? (
              <span className="text-muted"> · {currentProvider}</span>
            ) : null}
          </p>
          <p className="mb-3 font-mono text-[11px] text-mutedlo">
            The composer picks which profile answers; here you set the model that
            profile thinks with. This is a global Hermes setting — it changes the
            model for every chat against this profile.
          </p>
          <HermesModelCatalog
            options={options}
            currentModel={currentModel}
            busyModel={busyModel}
            onSet={onSetModel}
          />
          <button
            onClick={refreshLive}
            className="mt-3 border border-hair px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-parch hover:border-lapis hover:text-lapis"
          >
            REFRESH
          </button>
```

- [ ] **Step 6: Typecheck + full test run**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors (no dangling `pickModel` / `available` / `modelIds` references); all tests PASS.

- [ ] **Step 7: Visual verification against the live instance**

With `data/hermes.json` using `authMode: "session"` + a valid token, open the Command chamber and SAVE & TEST → status shows authenticated. In the MODEL section: the catalog renders grouped by upstream (OpenRouter marked "current"), search filters across groups, prices show as `input/output`, unavailable models are greyed/struck. Click an available model → status shows "Switching…", then "Active model is now …", and the Current line updates.

- [ ] **Step 8: Commit**

```bash
git add lib/hermesClient.ts components/HermesModelCatalog.tsx components/CommandView.tsx
git commit -m "feat(command): grouped Hermes model catalog with search, pricing, switching"
```

---

## Final verification

- [ ] Run the full suite: `npx vitest run` → all PASS.
- [ ] Typecheck: `npx tsc --noEmit` → clean.
- [ ] Production build sanity: `npm run build` → succeeds.
- [ ] End-to-end manual pass:
  - Command → discover `local` + `hermes`, toggle models.
  - Composer picker (per provider) shows exactly the enabled sets; sending a message uses the picked model/profile.
  - Command → switch the Hermes underlying LLM; `/model/info` reflects it.

---

## Spec coverage check

| Spec item | Task |
|---|---|
| `catalog` / `catalogUpdatedAt` data model | 5 |
| `session` auth mode + `X-Hermes-Session-Token` | 1 |
| Auth-aware connection test (reachable vs authenticated) | 2 |
| `.env.example` documents `session` | 3 |
| `extractModelIds` shared helper (DRY test route) | 4 |
| `POST /api/providers/discover` | 6 |
| `PATCH /api/providers/:id/models` (key-safe) | 7 |
| Command curation UI, all providers | 8 |
| Tightened `ModelOptions` type | 9 |
| `HermesModelCatalog` (search/group/pricing/unavailable) | 9 |
| Disambiguation copy + global-state warning | 9 |
| Composer reads curated `models` (no change needed) | (page.tsx unchanged) |

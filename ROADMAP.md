# Roadmap

Backlog of features and investigations. Items are *ideas with enough shape to act on* — not vague wishes. Move an item to `.hermes/plans/<date>_<slug>.md` (see the active plan workflow) when it's ready to execute; mark it **Done** or **Dropped** with a date when it's resolved.

**Reading this file:** The active plan for the current work-in-progress lives in `.hermes/plans/`. This file is what's *next* or *eventually*.

---

## Per-conversation project / directory context

**Source:** Investigation on 2026-06-30 into whether the Hermes Runs API supports per-run working directories.

**The finding:** It doesn't. `/v1/runs` (Hermes 0.17.0) accepts `input`, `instructions`, `previous_response_id`, `conversation_history`, `session_id`, `model` — nothing for `cwd`/`workspace`/`directory`. The cwd the gateway's tools see is the process-global `TERMINAL_CWD` env var, bridged from `config.yaml` `terminal.cwd` at boot. The dashboard's `/api/sessions/{id}` deliberately hides `cwd` (it's not in `_session_response`'s `safe_keys`), and PATCH only allows `title` and `end_reason`. So a third-party API client (Niphates) has no way to direct a run to a directory through the wire protocol. Only the embedded TUI/desktop can — it writes cwd to the session row through `tui_gateway/server.py:update_session_cwd()` and chdirs the user shell on resume.

**Niphates-side workaround (the plan):**

Mirror the Sanctum pattern: a new `"project-directory"` connector type in `lib/resourceConnectors.ts`, a `cwd: { connectorId, subPath }` field on conversations (`lib/types.ts` + `lib/schemas.ts`), and a `lib/projectContext.ts` module that builds a project-context block (tree + key files like AGENTS.md, README, package.json) and caches it under `data/project-context-cache.json`. At chat time, the chat route looks up `cwd`, prepends the block as a system-role message (OpenAI-shape providers) or as `instructions` on the Hermes run create (already accepted by `_handle_runs` as `ephemeral_system_prompt`). UI: a project picker in the Dialogue chamber mirroring the Sanctum folder picker, plus a small "📁 `/abs/path`" chip above the conversation.

**Tradeoff to accept:** The agent's `terminal`/`read_file`/`write_file` tools run inside the Hermes gateway's cwd, not the project root. We're relying on the agent following the "use absolute paths or `cd` first" instruction. This is how the Hermes desktop app itself works. The "agent genuinely runs in the project" experience needs an upstream Hermes change — see **Upstream: per-run cwd on `/v1/runs`** below.

**Status:** Designed, not started. File-by-file change list:
- `lib/types.ts` — add `cwd?` to conversation type
- `lib/schemas.ts` — extend `conversationsSchema` for the new optional field
- `lib/resourceConnectors.ts` — add `"project-directory"` connector type, config, validation branch
- `lib/projectContext.ts` — new: build + cache project context block
- `app/api/connectors/route.ts` — accept the new type
- `app/api/conversations/route.ts` — accept `cwd` on create/update
- `app/api/chat/route.ts` — look up `cwd`, prepend system context, pass `instructions` through
- `lib/connectors.ts` — Hermes connector passes `instructions` to run create; OpenAI connector prepends system message
- New UI: project picker in Dialogue chamber

---

## Upstream: per-run `cwd` on `/v1/runs` (Hermes feature request)

**Source:** Same investigation as above.

**The ask:** Add an optional `cwd: string` field to the request body of `POST /v1/runs` in `gateway/platforms/api_server.py`. The handler should resolve it (expand `~`, verify it exists, no symlink traversal outside an allowlist if possible) and either (a) `os.chdir()` the executor thread before `agent.run_conversation()` and retarget `os.environ["TERMINAL_CWD"]` for the duration of the run, or (b) set a contextvar that `agent/runtime_cwd.py` honours. Restore on completion. Also add `cwd` to `_session_response`'s `safe_keys` and to the PATCH `/api/sessions/{id}` `allowed` set, so desktop-style project metadata round-trips through the API.

**Why it matters:** Enables first-class project isolation for any third-party client (Niphates, ACp adapters, IDE plugins) without each one needing to either (a) shell-prefix every command or (b) hold a long-lived process whose cwd they control. The desktop app already has this implicitly; codifying it on the wire makes the desktop's UX a feature of the protocol, not a side-effect of being the embedded TUI.

**Where to file:** nousresearch/hermes-agent — issues. Cite the endpoint, the `_create_agent` factory, the `_session_response` projection, and the PATCH allowlist at `api_server.py:1538`.

**Status:** Not filed yet. Blocked on whether we want to upstream this ourselves or wait for the desktop's pattern to become a more formal API.

---

## Hermes session `cwd` round-trip for sync

**Source:** Same investigation.

**The gap:** The Hermes session DB has a `cwd` column (`hermes_state.py:1667 update_session_cwd`) and the dashboard's TUI writes it, but it's not exposed via the sessions API. For Niphates, this means: even if Niphates writes its own `cwd` to its own `data/conversations.json`, it can't sync that to a Hermes session so a Hermes-side UI shows the same project badge. Low priority — Niphates already keeps the source of truth in its own conversation store, and the dashboard isn't a primary surface for Niphates users. But it would be a nice-to-have for users who flip between the desktop and Niphates.

**Status:** Parked. Resolve as a side-effect of the upstream feature request above.

---

## Tool `result` and `inline_diff` in `tool.completed` events

**Source:** The active plan `.hermes/plans/2026-06-30_hermes-style-chat-stream.md` notes the gateway strips these from the event before forwarding.

**The ask:** Update `api_server.py:_make_run_event_callback` (line 3886) to forward `result` and `inline_diff`/`preview_diff` from the tool-completed kwargs. With that, Niphates can render actual file diffs in the tool card instead of just the path + command preview.

**Why deferred:** Out of scope for the chat-stream plan (niphates-side only). Needs the gateway change.

**Status:** Not filed upstream yet. Worth bundling with the `cwd` request above — both are "let third-party clients see what the desktop already sees."

---

## Other parked ideas

Short list of things that have come up in past sessions but don't have a plan. Add to this when an idea surfaces; move to a top-level section when it grows enough shape.

- **Studio + Council chambers** — both are placeholders in `app/page.tsx`. No design yet.
- **Spellcheck on the sanctum editor** — completed 2026-06-30 (see memory). Keeping the slot here so the file has a history of what shipped.
- **MCP-server connector type** — `AGENTS.md` notes it's the obvious next addition to `ConnectorType`. No demand yet.
- **PWA on LAN over plain HTTP** — service worker is gated to secure contexts. Workaround is tailscale serve / reverse proxy with a cert. No code change needed; this is a deployment footnote.

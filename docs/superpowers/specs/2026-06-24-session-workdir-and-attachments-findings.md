# Findings: Session Working Directory (cwd) in Niphates + Hermes

## Request

Michael wants to expand the Dialogues/chat feature to capture more of Hermes's agent capabilities. Specifically: a sidebar filebrowser that lets the user navigate to a folder on the server filesystem, and the agent in that session works within that folder unless otherwise instructed — similar to how the native Hermes App sidebar works.

## Investigation

### What Hermes already has

1. **Every session record stores `cwd`** — Hermes's SQLite session store (`hermes_state.py`) has a `cwd` column. When a session is created from the TUI, it records the directory the user was in. Sessions created from Niphates currently record `/root/workspace/projects/niphates` (the Hermes process's working directory).

2. **`set_session_vars()` supports `cwd`** — `gateway/session_context.py:124` accepts a `cwd` parameter and calls `set_session_cwd()` from `agent/runtime_cwd.py`, which pins the logical working directory via a `ContextVar` (`_SESSION_CWD`). This overrides `TERMINAL_CWD` and the launch directory for all file/terminal tools within that context.

3. **`db.update_session_cwd(session_id, cwd)` exists** — `hermes_state.py:1410` provides a direct method to update a session's stored `cwd`.

4. **The TUI already has this** — `tui_gateway/server.py` has `_session_cwd()`, `_register_session_cwd()`, and `_set_session_cwd()` functions that manage per-session working directories in the TUI.

### What's missing (the gap)

1. **`POST /v1/runs` does NOT accept `cwd`** — The API server's run handler (`api_server.py:3841`) reads `input`, `session_id`, `profile`, `instructions`, `conversation_history`, etc. from the request body. It does NOT read or pass `cwd`.

2. **`_bind_api_server_session()` does NOT pass `cwd`** — `api_server.py:3669` calls `set_session_vars()` but omits the `cwd` parameter, even though `set_session_vars` supports it.

3. **`PATCH /api/sessions/{id}` only allows `title` and `end_reason`** — `api_server.py:1528` restricts updatable fields to `{"title", "end_reason"}`. `cwd` is not in the allowed set.

4. **Niphates doesn't send cwd info** — `lib/connectors.ts` sends `session_id` and `profile` to Hermes but no working directory. `app/api/chat/route.ts` has no concept of a per-conversation workdir.

### Current Hermes config

```
terminal:
  backend: local
  cwd: /root/workspace/scratch
```

This `terminal.cwd` is a global fallback, not per-session. It's used for context-file discovery and system prompt hints but does NOT constrain where terminal commands run (that's the session's `cwd` or the launch directory).

## Suggested Architecture

### Approach: Store workdir in Niphates, push to Hermes before chat runs

Since patching Hermes source is fragile (updates overwrite changes), the cleanest path is:

1. **Add `workdir` to the Conversation type** — Store the selected working directory per conversation in Niphates's `data/conversations.json`.

2. **Filebrowser UI in Dialogue chamber** — A sidebar component that lets the user browse the server filesystem (with a new `POST /api/files/browse` endpoint that lists directory contents) and pick a folder.

3. **Push workdir to Hermes on change** — When the user selects a folder, PATCH the Hermes session's `cwd` via a small server-side function that calls `db.update_session_cwd()` directly (not through the HTTP API, since PATCH doesn't allow `cwd`). This can be a new endpoint like `POST /api/conversations/{id}/workdir` that Niphates handles server-side.

4. **Hermes uses it automatically** — Once `cwd` is stored on the session, Hermes's terminal tool, file tools, and system prompt all respect it. No further Hermes changes needed.

### Key files involved

| File | Role |
|------|------|
| `lib/types.ts` | Add `workdir` to `Conversation` interface |
| `lib/conversationStore.ts` | Persist `workdir` in conversations.json |
| `app/api/chat/route.ts` | Pass workdir context to streamChat (or set on session) |
| `lib/connectors.ts` | Hermes runs stream (session already has cwd) |
| `app/page.tsx` | Filebrowser UI + workdir state management |
| New: `app/api/files/browse/route.ts` | Server-side directory listing |
| New: `app/api/conversations/[id]/workdir/route.ts` | Update Hermes session cwd |

### Alternative (more invasive): Patch Hermes

If we want the `POST /v1/runs` endpoint to accept `cwd` directly (so the agent's context is pinned for the duration of the run), we'd need to:

1. Add `cwd` to the accepted body fields in `_handle_runs`
2. Pass it through `_bind_api_server_session` → `set_session_vars(cwd=...)`
3. This pins the ContextVar for the run's duration

This is more "correct" but requires modifying Hermes source, which gets overwritten on updates.

### Recommendation

Go with **Approach 1** (store in Niphates, update Hermes session `cwd` via direct DB call or new server endpoint). It's simpler, doesn't patch Hermes, and works with the existing Hermes session model. The only limitation is that the system prompt's "Current working directory" hint is computed at session creation time, not per-message — but since you'd set the workdir before the first message of a conversation, this is fine.

## Relevant Hermes Source References

- `hermes_state.py:1410` — `update_session_cwd(session_id, cwd)`
- `gateway/session_context.py:124` — `set_session_vars(cwd=...)` 
- `agent/runtime_cwd.py:23` — `set_session_cwd(cwd)` ContextVar setter
- `gateway/platforms/api_server.py:3841` — `_handle_runs()` (POST /v1/runs)
- `gateway/platforms/api_server.py:3669` — `_bind_api_server_session()` (no cwd)
- `gateway/platforms/api_server.py:1528` — PATCH session allowed fields
- `tui_gateway/server.py:1213` — TUI's `_session_cwd()` implementation

---

# Findings: File Attachments for Agent Use in Niphates + Hermes

## Request

Michael wants the chat UI to support attaching files for the agent to use — images, documents, code files — similar to how the native Hermes App and other AI chat interfaces let you drop files into the conversation.

## Investigation

### What Hermes already supports

1. **`POST /v1/chat/completions`** — Full multimodal content via `messages[].content` as a list of parts:
   - `{"type": "text", "text": "..."}` — plain text
   - `{"type": "image_url", "image_url": {"url": "data:image/...;base64,..."}}` — inline images
   - `{"type": "image_url", "image_url": {"url": "https://..."}}` — image URLs (http/https only)
   - Also accepts `input_image` spelling (OpenAI Responses API compatibility)
   - Validates URLs, enforces `data:image/` scheme for base64, rejects non-image data URLs

2. **`POST /api/sessions/{id}/chat`** and **`POST /api/sessions/{id}/chat/stream`** — Uses `_session_chat_user_message()` → `_normalize_multimodal_content()`, so it accepts the same multimodal content parts. This endpoint also supports session continuity via `X-Hermes-Session-Id` header.

3. **Agent pipeline handles multimodal** — `agent/conversation_loop.py` and `run_agent.py` already process `image_url` / `input_image` content parts. The agent can download images, analyze them via `vision_analyze_tool`, and has failback logic for vision-unsupported models.

4. **File parts explicitly rejected** — `{"type": "file"}` and `{"type": "input_file"}` raise `ValueError("uploaded files and document inputs are not supported on this endpoint")`.

### What does NOT work

1. **`POST /v1/runs`** — The Runs API (what Niphates currently uses) only accepts `input` as a string or extracts the last item's `content` as a flat string. Image parts are silently dropped. No multimodal support.

2. **File/document uploads** — No API endpoint accepts file uploads. Hermes has no `multipart/form-data` handler. Files must be sent as text content or image URLs.

3. **No attachment tool** — Hermes tools don't include an "attach file" or "upload file" tool. The agent reads files via `read_file` / `search_files` tools on the server filesystem.

### Current Niphates chat flow

- `app/page.tsx` builds messages as `{ role: "user", content: text }` — plain text only
- `lib/connectors.ts` sends to `/v1/runs` with `input: lastUser.content` — no multimodal
- `app/api/chat/route.ts` — No attachment handling, no file upload endpoint
- No existing file browser or file picker UI in the chat

## Options

### Option 1: Read files server-side, inject as text (works today, no Hermes changes)

- User attaches a file in Niphates chat UI
- Niphates reads the file server-side (same filesystem)
- Injects content into the message as: `[Attached file: /path/to/file.txt]\n\n<file content>`
- Sends to Hermes as a normal text message via `/v1/runs`

**Pros**: Zero Hermes changes. Works for all text files (markdown, code, logs, PDFs if parsed). The agent can read any file on the server.
**Cons**: No image/vision support. Large files may exceed context limits.

### Option 2: Use `/api/sessions/{id}/chat/stream` for multimodal

Switch from `/v1/runs` to Hermes's session chat endpoint:
- Accepts `image_url` content parts (text + images)
- Supports session continuity
- Returns SSE streaming responses

**Pros**: Full image/vision support. Agent can see images via model vision. No Hermes patching.
**Cons**: Different response shape (no tool call event stream). Loses the live reasoning + tool card UI that Niphates currently shows. Would require significant client-side parser changes.

### Option 3: Hybrid — `/v1/runs` for agentic, `/v1/chat/completions` for vision

- Normal messages with tool calls: `/v1/runs` (current flow)
- Messages with image attachments: route through `/v1/chat/completions` (supports `image_url` parts)

**Pros**: Keeps the rich tool event stream for normal use. Adds vision when needed.
**Cons**: Two different code paths. `/v1/chat/completions` doesn't stream tool events the same way. Complex client-side logic.

### Option 4: Patch the Runs endpoint for multimodal

Modify `_handle_runs` in `api_server.py` to:
- Accept `input` as a list of content parts
- Pass the full list to `run_conversation` instead of extracting just the last text part

**Pros**: Single endpoint, full agent capabilities + multimodal.
**Cons**: Requires patching Hermes source (overwritten on updates). Fragile.

### Option 5: Upload to server, reference by path

- User uploads a file via a new Niphates upload endpoint
- File is saved to a temp location on the server
- Niphates sends the file path to Hermes in the message text
- Agent uses `read_file` / `vision_analyze` tools to access it

**Pros**: Works with current `/v1/runs` endpoint. Agent can access any file type via its tools. No Hermes changes.
**Cons**: Requires file upload handling in Niphates. Need to manage temp file cleanup.

## Recommendation

**Option 1 (text injection) + Option 5 (file path reference) for initial implementation:**

1. Add a file picker to the chat UI
2. On file selection, read the file server-side and inject its content as text into the message
3. For images, optionally upload to server and use Option 2 or 3
4. The agent can also use `read_file` on any server path it has access to

This gives immediate attachment support without patching Hermes. Image support can be added later by introducing the session chat endpoint or patching the runs endpoint.

For images specifically, the simplest path is: upload image to server → send as `data:image/...` base64 or `file://` path in a `/v1/chat/completions` call → agent analyzes via vision.

## Relevant Hermes Source References

- `gateway/platforms/api_server.py:207` — `_normalize_multimodal_content()` (image_url support)
- `gateway/platforms/api_server.py:300` — `_FILE_PART_TYPES` rejection
- `gateway/platforms/api_server.py:352` — `_session_chat_user_message()` (session chat multimodal)
- `gateway/platforms/api_server.py:1622` — `_handle_session_chat()` (POST /api/sessions/{id}/chat)
- `gateway/platforms/api_server.py:1807` — `_handle_chat_completions()` (POST /v1/chat/completions)
- `gateway/platforms/api_server.py:3841` — `_handle_runs()` (POST /v1/runs, no multimodal)
- `agent/conversation_loop.py:495` — `run_conversation()` (multimodal agent pipeline)
- `agent/turn_context.py:250` — `original_user_message` preservation
- `tools/send_message_tool.py:165` — `MEDIA:<path>` convention for platform file sending

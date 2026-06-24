# Dialogue Chat Rename — Design Spec

**Date:** 2026-06-23  
**Status:** Approved

## Summary

Add the ability to rename a chat in the Dialogue chamber via an inline-edit interaction triggered from the existing `⋯` context menu in `ChatRow`.

## Context menu

Add a **RENAME** menu item to the `⋯` portal menu in `ChatRow` (`components/Sidebar.tsx`), placed above the existing ARCHIVE item. Clicking it closes the menu and activates rename mode on that row.

## Inline edit mechanics

`ChatRow` gains a `renaming: boolean` local state. When `renaming` is true:

- The title `<button>` is replaced by an `<input>` pre-filled with `c.title` and `autoFocus`ed.
- Styling matches the row's existing monospace type (`font-mono text-[15px] md:text-[12.5px]`) and active/inactive color so it looks continuous with the list.
- The input is `flex-1` and `truncate`-free while editing (no truncation on an input).

**Confirm** (Enter key or `onBlur`):
- Trim the value.
- If the trimmed value is non-empty and differs from the original title, call `onRename(c.id, trimmedValue)`.
- If empty, revert to the original title without saving.
- Exit rename mode.

**Cancel** (Escape key):
- Revert to the original title without calling `onRename`.
- Exit rename mode.

`onBlur` also confirms (covers clicking away), so Escape must be caught on `onKeyDown` before `onBlur` fires — set a ref flag `cancelledRef` on Escape so the blur handler knows to skip the save.

## Data flow

`ChatRow` receives a new prop: `onRename: (id: string, title: string) => void`.

In `app/page.tsx`, the handler:
1. Maps over `conversations`, replacing the matching entry's `title` and updating `updatedAt`.
2. Calls `saveConversations(updated)` — the same debounced PUT to `/api/conversations` already used for archive/delete.
3. Calls `hermesApi.renameSession(id, title)` to push the rename to Hermes via `PATCH /api/sessions/{id}` through the `/api/hx/*` proxy. Fire-and-forget (`.catch(() => {})`) — local title is the source of truth.

No new API routes. No schema changes — `Conversation.title` (string) already exists in `lib/types.ts`. The auto-title logic in `lib/storage.ts` (`titleFrom`) is untouched.

## What's not changing

- `lib/types.ts` — no changes.
- `lib/storage.ts` — no changes.
- `/api/conversations` route — no changes.
- `titleFrom()` auto-naming on first send — no changes.
- Archived chats can also be renamed (same `ChatRow`, same menu).

## Files touched

| File | Change |
|------|--------|
| `components/Sidebar.tsx` | Add RENAME menu item; add `renaming` state + input UI to `ChatRow`; add `onRename` prop |
| `app/page.tsx` | Add `handleRename` callback; pass `onRename` down through `Sidebar` → `ChatRow` |

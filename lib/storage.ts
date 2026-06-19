// Client-side conversation persistence, backed by the server (/api/conversations).
// History now lives server-side so it survives a cache clear and syncs across
// devices. Saves are debounced and coalesced: the chat UI calls
// `saveConversations` freely (e.g. on every streamed token) and we flush the
// latest snapshot at most once per debounce window.

import type { Conversation } from "./types";

export async function loadConversations(): Promise<Conversation[]> {
  if (typeof window === "undefined") return [];
  try {
    const res = await fetch("/api/conversations");
    if (!res.ok) return [];
    const d = (await res.json()) as { conversations?: Conversation[] };
    const list = d.conversations ?? [];
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

const SAVE_DEBOUNCE_MS = 400;
let pending: Conversation[] | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush(): Promise<void> {
  if (typeof window === "undefined") return;
  timer = null;
  const snapshot = pending;
  pending = null;
  if (!snapshot) return;
  try {
    await fetch("/api/conversations", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversations: snapshot }),
    });
  } catch {
    /* best-effort; the next save will retry with newer state */
  }
}

/** Queue a save of the whole list. Coalesces rapid calls into one request. */
export function saveConversations(list: Conversation[]): void {
  if (typeof window === "undefined") return;
  pending = list;
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, SAVE_DEBOUNCE_MS);
}

/** Force any pending save immediately (e.g. when a stream completes). */
export function flushConversations(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  return flush();
}

export function newConversation(providerId: string, model: string): Conversation {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    providerId,
    model,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Derive a short title from the first user message. */
export function titleFrom(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > 40 ? t.slice(0, 40) + "…" : t || "New chat";
}

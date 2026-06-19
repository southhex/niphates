// Server-side conversation history. Single-user, so the whole history is one
// JSON file under data/, written atomically through the shared store. This
// replaces the previous browser-localStorage-only persistence, enabling
// multi-device access. Server-only.

import "server-only";
import { createJsonStore } from "./jsonStore";
import type { Conversation } from "./types";

const store = createJsonStore<Conversation[]>({
  filename: "conversations.json",
  seed: () => [],
});

export async function getConversations(): Promise<Conversation[]> {
  return store.read();
}

export async function saveConversations(
  list: Conversation[],
): Promise<Conversation[]> {
  return store.write(list);
}

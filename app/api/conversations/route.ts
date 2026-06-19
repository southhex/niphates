// Conversation history API (single-user, server-persisted).
//   GET -> { conversations }   full list, newest first
//   PUT -> { conversations }   replace the whole list

import { NextRequest } from "next/server";
import {
  getConversations,
  saveConversations,
} from "@/lib/conversationStore";
import { conversationsSchema, formatZodError } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const conversations = await getConversations();
  return Response.json({ conversations });
}

export async function PUT(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Accept either a bare array or { conversations: [...] }.
  const candidate =
    raw && typeof raw === "object" && "conversations" in raw
      ? (raw as { conversations: unknown }).conversations
      : raw;

  const parsed = conversationsSchema.safeParse(candidate);
  if (!parsed.success) {
    return Response.json(
      { error: formatZodError(parsed.error) },
      { status: 400 },
    );
  }

  const saved = await saveConversations(parsed.data);
  return Response.json({ conversations: saved });
}

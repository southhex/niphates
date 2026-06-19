"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { MessageList } from "@/components/MessageList";
import { Composer } from "@/components/Composer";
import { streamChatRequest } from "@/lib/client";
import {
  loadConversations,
  saveConversations,
  flushConversations,
  newConversation,
  titleFrom,
} from "@/lib/storage";
import type { Conversation, PublicProvider } from "@/lib/types";

export default function Home() {
  const [providers, setProviders] = useState<PublicProvider[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [providerId, setProviderId] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [streaming, setStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // --- Initial load ------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    loadConversations().then((convos) => {
      if (cancelled) return;
      setConversations(convos);
      if (convos[0]) setActiveId(convos[0].id);
    });

    fetch("/api/providers")
      .then((r) => r.json())
      .then((d: { providers: PublicProvider[] }) => {
        if (cancelled) return;
        const enabled = d.providers.filter((p) => p.enabled !== false);
        setProviders(enabled);
        if (enabled[0]) {
          setProviderId(enabled[0].id);
          setModel(enabled[0].defaultModel || enabled[0].models[0] || "");
        }
      })
      .catch(() => {
        if (!cancelled) setProviders([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) || null,
    [conversations, activeId],
  );
  const currentProvider = providers.find((p) => p.id === providerId);

  // Keep model in sync when the active conversation or provider changes.
  useEffect(() => {
    if (active) {
      setProviderId(active.providerId);
      setModel(active.model);
    }
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback((list: Conversation[]) => {
    setConversations(list);
    saveConversations(list);
  }, []);

  const handleNew = () => {
    if (!providerId) return;
    const c = newConversation(providerId, model);
    const list = [c, ...conversations];
    persist(list);
    setActiveId(c.id);
    setSidebarOpen(false);
  };

  const handleDelete = (id: string) => {
    const list = conversations.filter((c) => c.id !== id);
    persist(list);
    if (activeId === id) setActiveId(list[0]?.id ?? null);
  };

  const onProviderChange = (id: string) => {
    setProviderId(id);
    const p = providers.find((x) => x.id === id);
    const m = p?.defaultModel || p?.models[0] || "";
    setModel(m);
  };

  // --- Send a message ----------------------------------------------------
  const handleSend = async (text: string) => {
    if (!providerId || !model) return;

    // Ensure there is an active conversation to write into.
    let convo = active;
    let list = conversations;
    if (!convo) {
      convo = newConversation(providerId, model);
      list = [convo, ...conversations];
      setActiveId(convo.id);
    }

    const id = convo.id;
    const userMsg = { role: "user" as const, content: text };
    const withUser: Conversation = {
      ...convo,
      providerId,
      model,
      title: convo.messages.length === 0 ? titleFrom(text) : convo.title,
      messages: [...convo.messages, userMsg, { role: "assistant", content: "" }],
      updatedAt: Date.now(),
    };
    list = list.map((c) => (c.id === id ? withUser : c));
    persist(list);

    setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const messagesForApi = withUser.messages.slice(0, -1); // drop empty assistant

    await streamChatRequest(
      { providerId, model, messages: messagesForApi },
      {
        onDelta: (delta) => {
          setConversations((prev) => {
            const next = prev.map((c) => {
              if (c.id !== id) return c;
              const msgs = [...c.messages];
              const last = msgs[msgs.length - 1];
              msgs[msgs.length - 1] = {
                ...last,
                content: last.content + delta,
              };
              return { ...c, messages: msgs, updatedAt: Date.now() };
            });
            saveConversations(next);
            return next;
          });
        },
        onError: (message) => {
          setConversations((prev) => {
            const next = prev.map((c) => {
              if (c.id !== id) return c;
              const msgs = [...c.messages];
              const last = msgs[msgs.length - 1];
              msgs[msgs.length - 1] = {
                ...last,
                content:
                  (last.content ? last.content + "\n\n" : "") +
                  `⚠️ ${message}`,
              };
              return { ...c, messages: msgs };
            });
            saveConversations(next);
            return next;
          });
        },
      },
      ctrl.signal,
    );

    setStreaming(false);
    abortRef.current = null;
    // Persist the finished turn immediately rather than waiting out the debounce.
    void flushConversations();
  };

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  };

  const noProviders = providers.length === 0;

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        open={sidebarOpen}
        onSelect={(id) => {
          setActiveId(id);
          setSidebarOpen(false);
        }}
        onNew={handleNew}
        onDelete={handleDelete}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
          <button
            className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 md:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            ☰
          </button>

          <div className="flex flex-1 items-center gap-2 overflow-x-auto">
            <select
              value={providerId}
              onChange={(e) => onProviderChange(e.target.value)}
              disabled={noProviders}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm outline-none focus:border-amber-500"
            >
              {noProviders && <option>No providers</option>}
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={!currentProvider || currentProvider.models.length === 0}
              className="min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm outline-none focus:border-amber-500"
            >
              {(currentProvider?.models || []).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </header>

        {/* Messages */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {noProviders ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-slate-400">
              <div className="max-w-md space-y-2">
                <div className="text-4xl">⚡</div>
                <p>
                  No providers configured. Open{" "}
                  <a href="/settings" className="text-amber-400 underline">
                    Settings
                  </a>{" "}
                  to connect Hermes Agent or another API.
                </p>
              </div>
            </div>
          ) : (
            <MessageList
              messages={active?.messages || []}
              streaming={streaming}
            />
          )}
        </div>

        {/* Composer */}
        <Composer
          disabled={noProviders}
          streaming={streaming}
          onSend={handleSend}
          onStop={handleStop}
        />
      </main>
    </div>
  );
}

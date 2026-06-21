"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { MessageList } from "@/components/MessageList";
import { Composer } from "@/components/Composer";
import { Select } from "@/components/Select";
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
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [unread, setUnread] = useState<Set<string>>(() => new Set());
  const streaming = streamingId !== null;
  const activeIdRef = useRef<string | null>(activeId);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // --- Initial load ------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    loadConversations().then((convos) => {
      if (cancelled) return;
      setConversations(convos);
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

  // Escape returns to the home view (and closes the mobile sidebar first if open).
  // Does not abort an in-flight stream — it keeps summoning in the background.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (sidebarOpen) {
        setSidebarOpen(false);
        return;
      }
      setActiveId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) || null,
    [conversations, activeId],
  );

  // Mirror activeId into a ref so stream-completion callbacks read the latest value.
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

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
    // If the chat is mid-stream, abort it — the reply would have nowhere to land,
    // and otherwise streamingId would stay stuck on a gone conversation.
    if (streamingId === id) {
      abortRef.current?.abort();
      abortRef.current = null;
      setStreamingId(null);
    }
    const list = conversations.filter((c) => c.id !== id);
    persist(list);
    setUnread((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (activeId === id) {
      const next = list.find((c) => !c.archived) ?? list[0];
      setActiveId(next?.id ?? null);
    }
  };

  const setArchived = (id: string, archived: boolean) => {
    const list = conversations.map((c) =>
      c.id === id ? { ...c, archived, updatedAt: Date.now() } : c,
    );
    persist(list);
    // Step off an archived chat so the main view doesn't sit on a hidden one.
    if (archived && activeId === id) {
      const next = list.find((c) => !c.archived);
      setActiveId(next?.id ?? null);
    }
  };

  const handleArchive = (id: string) => setArchived(id, true);
  const handleUnarchive = (id: string) => setArchived(id, false);

  // Write a provider/model change straight onto the active conversation so the
  // dropdown is a live switch, not just a setting for the next message.
  const applyModelToActive = (nextProviderId: string, nextModel: string) => {
    if (!activeId) return;
    persist(
      conversations.map((c) =>
        c.id === activeId
          ? { ...c, providerId: nextProviderId, model: nextModel }
          : c,
      ),
    );
  };

  const onProviderChange = (id: string) => {
    setProviderId(id);
    const p = providers.find((x) => x.id === id);
    const m = p?.defaultModel || p?.models[0] || "";
    setModel(m);
    applyModelToActive(id, m);
  };

  const onModelChange = (m: string) => {
    setModel(m);
    applyModelToActive(providerId, m);
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

    setStreamingId(id);
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

    setStreamingId(null);
    // Flag an unseen reply only if the turn actually completed (wasn't aborted via
    // STOP or a delete) and landed in a chat the user isn't currently viewing.
    if (!ctrl.signal.aborted && activeIdRef.current !== id) {
      setUnread((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    }
    abortRef.current = null;
    // Persist the finished turn immediately rather than waiting out the debounce.
    void flushConversations();
  };

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreamingId(null);
  };

  const noProviders = providers.length === 0;

  return (
    <div className="fixed inset-0 flex overflow-hidden">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        streamingId={streamingId}
        unread={unread}
        open={sidebarOpen}
        onSelect={(id) => {
          setActiveId(id);
          setSidebarOpen(false);
          setUnread((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }}
        onNew={handleNew}
        onArchive={handleArchive}
        onUnarchive={handleUnarchive}
        onDelete={handleDelete}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {/* Header — top/horizontal safe-area insets so it clears the notch */}
        <header className="flex items-center gap-2 border-b border-hair bg-paneldk pb-2 pl-[calc(0.75rem+env(safe-area-inset-left))] pr-[calc(0.75rem+env(safe-area-inset-right))] pt-[calc(0.5rem+env(safe-area-inset-top))]">
          <button
            className="-ml-1 p-2.5 font-mono text-[20px] leading-none text-parch hover:text-marble md:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            ☰
          </button>

          <div className="flex flex-1 items-center gap-2 overflow-x-auto">
            {/* Provider chip */}
            <div className="flex items-center gap-1.5 border border-hair bg-panel px-3 py-2 md:px-2.5 md:py-1.5">
              <span className="status-dot status-dot-malach" />
              <Select
                value={providerId}
                onChange={onProviderChange}
                options={providers.map((p) => ({ value: p.id, label: p.name }))}
                disabled={noProviders}
                placeholder="No providers"
                valueClassName="text-marble"
              />
            </div>

            {/* Model chip */}
            <div className="flex items-center gap-1 border border-hair bg-panel px-3 py-2 md:px-2.5 md:py-1.5">
              <Select
                value={model}
                onChange={onModelChange}
                options={(currentProvider?.models ?? []).map((m) => ({ value: m, label: m }))}
                disabled={!currentProvider || currentProvider.models.length === 0}
                valueClassName="text-gold min-w-[8rem]"
              />
            </div>
          </div>
        </header>

        {/* Messages */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {noProviders ? (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <div className="max-w-md">
                <div className="mb-4 font-display text-[36px] font-semibold uppercase tracking-[0.1em] text-marble">
                  NIPHATES
                </div>
                <p className="font-mono text-[13px] text-parch">
                  No providers configured. Open{" "}
                  <a
                    href="/settings"
                    className="text-gold underline underline-offset-2 hover:text-goldbri"
                  >
                    Settings
                  </a>{" "}
                  to connect Hermes Agent or another API.
                </p>
              </div>
            </div>
          ) : (
            <MessageList
              messages={active?.messages || []}
              streaming={streaming && active?.id === streamingId}
            />
          )}
        </div>

        {/* Composer */}
        <Composer
          disabled={noProviders || (streaming && active?.id !== streamingId)}
          streaming={streaming && active?.id === streamingId}
          onSend={handleSend}
          onStop={handleStop}
        />
      </main>
    </div>
  );
}

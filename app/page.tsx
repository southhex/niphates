// app/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PanelLeft, Settings as SettingsIcon } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { MessageList } from "@/components/MessageList";
import { Composer } from "@/components/Composer";
import { CommandView } from "@/components/CommandView";
import { ChamberPlaceholder } from "@/components/ChamberPlaceholder";
import { Select } from "@/components/Select";
import { type ChamberId } from "@/components/chambers";
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
  const [activeChamber, setActiveChamber] = useState<ChamberId>("dialogue");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const streaming = streamingId !== null;
  const activeIdRef = useRef<string | null>(activeId);
  const abortRef = useRef<AbortController | null>(null);

  // Close the drawer on small screens after first mount. Runs once so the
  // SSR default (open) doesn't desync hydration; desktop stays expanded.
  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) setSidebarOpen(false);
  }, []);

  const closeOnMobile = () => {
    if (window.matchMedia("(max-width: 767px)").matches) setSidebarOpen(false);
  };

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

  // Escape returns to the Dialogue home view; on mobile it closes the drawer first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (sidebarOpen && window.matchMedia("(max-width: 767px)").matches) {
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

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const currentProvider = providers.find((p) => p.id === providerId);

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
    closeOnMobile();
  };

  const handleDelete = (id: string) => {
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
    if (archived && activeId === id) {
      const next = list.find((c) => !c.archived);
      setActiveId(next?.id ?? null);
    }
  };

  const handleArchive = (id: string) => setArchived(id, true);
  const handleUnarchive = (id: string) => setArchived(id, false);

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

    const messagesForApi = withUser.messages.slice(0, -1);

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
                  (last.content ? last.content + "\n\n" : "") + `⚠️ ${message}`,
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
    if (!ctrl.signal.aborted && activeIdRef.current !== id) {
      setUnread((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    }
    abortRef.current = null;
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
        activeChamber={activeChamber}
        onSelectChamber={(ch) => {
          setActiveChamber(ch);
          closeOnMobile();
        }}
        sidebarOpen={sidebarOpen}
        onCollapse={() => setSidebarOpen(false)}
        onSelect={(id) => {
          setActiveId(id);
          setActiveChamber("dialogue");
          closeOnMobile();
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
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {/* Top bar — transparent, borderless; insets clear the notch */}
        <header className="flex items-center gap-2 pb-2 pl-[calc(0.75rem+env(safe-area-inset-left))] pr-[calc(0.75rem+env(safe-area-inset-right))] pt-[calc(0.5rem+env(safe-area-inset-top))]">
          {!sidebarOpen && (
            <button
              className="-ml-1 flex h-9 w-9 items-center justify-center text-parch hover:text-marble"
              onClick={() => setSidebarOpen(true)}
              aria-label="Show sidebar"
            >
              <PanelLeft size={18} />
            </button>
          )}

          <div className="flex flex-1 items-center justify-end gap-2 overflow-x-auto">
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

            {/* Settings gear — sole entry point to Settings */}
            <Link
              href="/settings"
              aria-label="Settings"
              className="flex h-9 w-9 items-center justify-center text-parch hover:text-marble"
            >
              <SettingsIcon size={18} />
            </Link>
          </div>
        </header>

        {/* Main pane — swaps by active chamber */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {activeChamber === "dialogue" ? (
            noProviders ? (
              <div className="flex h-full items-center justify-center px-6 text-center">
                <div className="max-w-md">
                  <div className="mb-4 font-display text-[36px] font-semibold uppercase tracking-[0.1em] text-marble">
                    NIPHATES
                  </div>
                  <p className="font-mono text-[13px] text-parch">
                    No providers configured. Open{" "}
                    <Link
                      href="/settings"
                      className="text-gold underline underline-offset-2 hover:text-goldbri"
                    >
                      Settings
                    </Link>{" "}
                    to connect Hermes Agent or another API.
                  </p>
                </div>
              </div>
            ) : (
              <MessageList
                messages={active?.messages || []}
                streaming={streaming && active?.id === streamingId}
              />
            )
          ) : activeChamber === "command" ? (
            <CommandView />
          ) : (
            <ChamberPlaceholder chamber={activeChamber} />
          )}
        </div>

        {/* Composer — Dialogue chamber only */}
        {activeChamber === "dialogue" && (
          <Composer
            disabled={noProviders || (streaming && active?.id !== streamingId)}
            streaming={streaming && active?.id === streamingId}
            onSend={handleSend}
            onStop={handleStop}
            models={currentProvider?.models ?? []}
            model={model}
            onModelChange={onModelChange}
          />
        )}
      </main>
    </div>
  );
}

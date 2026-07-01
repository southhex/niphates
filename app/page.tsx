// app/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PanelLeft, Settings as SettingsIcon } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { MessageList } from "@/components/MessageList";
import { Composer, type SlashCommandSpec } from "@/components/Composer";
import { CommandView } from "@/components/CommandView";
import { LibraryView } from "@/components/LibraryView";
import { ChamberPlaceholder } from "@/components/ChamberPlaceholder";
import { Select } from "@/components/Select";
import { type ChamberId, firstSubsection } from "@/components/chambers";
import { streamChatRequest, approvalResponse } from "@/lib/client";
import { ApprovalCard, type PendingApproval } from "@/components/ApprovalCard";
import {
  loadConversations,
  saveConversations,
  flushConversations,
  newConversation,
  titleFrom,
} from "@/lib/storage";
import type { ChatMessage, Conversation, PublicProvider } from "@/lib/types";
import { hermesApi } from "@/lib/hermesClient";
import {
  applyToolEvent,
  appendReasoningDelta,
  appendTextDelta,
} from "@/lib/blocks";

export default function Home() {
  const [providers, setProviders] = useState<PublicProvider[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [providerId, setProviderId] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [unread, setUnread] = useState<Set<string>>(() => new Set());
  const [activeChamber, setActiveChamber] = useState<ChamberId>("dialogue");
  // The active subsection (main tab) of the current chamber, shown in the
  // sidebar. Only Command has subsections today; defaults to its built tab.
  const [subsection, setSubsection] = useState<string>("connectors");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const streaming = streamingId !== null;
  const activeIdRef = useRef<string | null>(activeId);
  const abortRef = useRef<AbortController | null>(null);
  const currentRunIdRef = useRef<string | null>(null);

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

  // Touch gestures (mobile drawer only): edge-swipe right opens the sidebar,
  // swipe left closes it. Flick + threshold — the drawer animates via its own
  // CSS transition. Passive listeners so we never block scrolling.
  useEffect(() => {
    const EDGE = 24; // px from the left edge that counts as an "open" start
    const THRESHOLD = 60; // min horizontal travel to count as a swipe
    let startX = 0;
    let startY = 0;
    let fromEdge = false;
    let tracking = false;

    const onStart = (e: TouchEvent) => {
      // Only acts where the sidebar is an overlay drawer (below md).
      if (!window.matchMedia("(max-width: 767px)").matches) {
        tracking = false;
        return;
      }
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      fromEdge = startX <= EDGE;
      tracking = sidebarOpen || fromEdge;
    };

    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      // Require a horizontal-dominant swipe so vertical scrolls don't trigger it.
      if (Math.abs(dx) < THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return;
      if (dx > 0 && !sidebarOpen && fromEdge) setSidebarOpen(true);
      else if (dx < 0 && sidebarOpen) setSidebarOpen(false);
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [sidebarOpen]);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) || null,
    [conversations, activeId],
  );

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const currentProvider = providers.find((p) => p.id === providerId);
  const isGateway = currentProvider?.kind === "gateway";
  // Direct providers pick from their curated model list; the Gateway uses the
  // composer's inline model switcher instead (see below).
  const composerModels = currentProvider?.models ?? [];

  // The Gateway always chats as the `default` profile for now — the composer
  // switches that profile's underlying model, not the profile itself.
  useEffect(() => {
    if (isGateway && model !== "default") setModel("default");
  }, [isGateway, model]);

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

  const handleRename = (id: string, title: string) => {
    persist(
      conversations.map((c) =>
        c.id === id ? { ...c, title, updatedAt: Date.now() } : c,
      ),
    );
    // Push rename to Hermes (fire-and-forget; failures are silent — the local
    // title is the source of truth and Hermes may not be connected).
    hermesApi.renameSession(id, title).catch(() => {});
  };

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
    const m =
      p?.kind === "gateway" ? "default" : p?.defaultModel || p?.models[0] || "";
    setModel(m);
    applyModelToActive(id, m);
  };

  const onModelChange = (m: string) => {
    setModel(m);
    applyModelToActive(providerId, m);
  };

  // --- Send a message ----------------------------------------------------
  // `replaceLast` (used by /retry) drops the previous user+assistant pair from
  // the base before appending, so the same prompt regenerates in place.
  const handleSend = async (text: string, opts?: { replaceLast?: boolean }) => {
    if (!providerId || !model) return;

    let convo = active;
    let list = conversations;
    if (!convo) {
      convo = newConversation(providerId, model);
      list = [convo, ...conversations];
      setActiveId(convo.id);
    }

    const id = convo.id;
    const baseMessages = opts?.replaceLast
      ? convo.messages.slice(0, -2)
      : convo.messages;
    const isFirstMessage = baseMessages.length === 0;
    const userMsg = { role: "user" as const, content: text };
    const withUser: Conversation = {
      ...convo,
      providerId,
      model,
      title: isFirstMessage ? titleFrom(text) : convo.title,
      messages: [...baseMessages, userMsg, { role: "assistant", content: "" }],
      updatedAt: Date.now(),
    };
    list = list.map((c) => (c.id === id ? withUser : c));
    persist(list);

    setStreamingId(id);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const messagesForApi = withUser.messages.slice(0, -1);

    // Update the in-flight assistant message (always the last one) of convo `id`.
    const updateAssistant = (mutate: (m: ChatMessage) => ChatMessage) => {
      setConversations((prev) => {
        const next = prev.map((c) => {
          if (c.id !== id) return c;
          const msgs = [...c.messages];
          msgs[msgs.length - 1] = mutate(msgs[msgs.length - 1]);
          return { ...c, messages: msgs, updatedAt: Date.now() };
        });
        saveConversations(next);
        return next;
      });
    };

    currentRunIdRef.current = null;
    await streamChatRequest(
      {
        providerId,
        model,
        messages: messagesForApi,
        conversationId: id,
        hermesSessionId: convo.hermesSessionId,
      },
      {
        onRunStarted: (runId) => {
          currentRunIdRef.current = runId;
        },
        onSessionIdUpdated: (sessionId) => {
          // Hermes rotated the effective session id (context compression).
          // Persist on the conversation so the next turn resumes from the
          // compressed continuation rather than the stale parent.
          setConversations((prev) => {
            const next = prev.map((c) =>
              c.id === id ? { ...c, hermesSessionId: sessionId } : c,
            );
            saveConversations(next);
            return next;
          });
        },
        onApproval: ({ approvalId, tool, command, description }) => {
          const runId = currentRunIdRef.current;
          if (!runId) return;
          setPendingApproval({ runId, approvalId, tool, command, description });
        },
        onDelta: (delta) => {
          updateAssistant((last) => appendTextDelta(last, delta));
        },
        onReasoning: (text) => {
          updateAssistant((last) => appendReasoningDelta(last, text));
        },
        onTool: (event) => {
          updateAssistant((last) => applyToolEvent(last, event));
        },
        onError: (message) => {
          setPendingApproval(null);
          setConversations((prev) => {
            const next = prev.map((c) => {
              if (c.id !== id) return c;
              const msgs = [...c.messages];
              const last = msgs[msgs.length - 1];
              // Mirror the error into `blocks` so it renders through the new
              // block-based path. For old conversations without `blocks`, the
              // flat `content` update is sufficient.
              const errorText = `⚠️ ${message}`;
              const blocks = last.blocks
                ? [...last.blocks, { type: "text" as const, text: errorText }]
                : undefined;
              msgs[msgs.length - 1] = {
                ...last,
                content:
                  (last.content ? last.content + "\n\n" : "") + errorText,
                ...(blocks ? { blocks } : {}),
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

    setPendingApproval(null);
    setStreamingId(null);
    // Push auto-title to Hermes after the first message completes. Hermes
    // auto-title doesn't fire for Niphates sessions (it sees the full history
    // and thinks it's not a first exchange), so we push it ourselves.
    if (isFirstMessage) {
      hermesApi.renameSession(id, withUser.title).catch(() => {});
    }
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

  // --- Slash commands ----------------------------------------------------
  // These run locally against Niphates' own (client-side) conversation state —
  // they are NOT agent endpoints. The picker in the Composer renders this list;
  // runCommand dispatches. Returning false falls through to send as a message.
  const slashCommands: SlashCommandSpec[] = useMemo(
    () => [
      { name: "help", desc: "List available commands" },
      { name: "new", desc: "Start a new conversation" },
      { name: "clear", desc: "Clear this conversation" },
      { name: "title", desc: "Rename this conversation", arg: "[title]" },
      { name: "model", desc: "Switch model", arg: "name" },
      { name: "retry", desc: "Regenerate the last response" },
      { name: "undo", desc: "Remove the last exchange" },
      { name: "stop", desc: "Stop the current response" },
    ],
    [],
  );

  // Append a transient assistant note to the active conversation (used by
  // /help, /title, etc. for inline feedback). No-op when there's no chat.
  const pushNote = (content: string) => {
    if (!activeId) return;
    persist(
      conversations.map((c) =>
        c.id === activeId
          ? {
              ...c,
              messages: [...c.messages, { role: "assistant", content }],
              updatedAt: Date.now(),
            }
          : c,
      ),
    );
  };

  const runCommand = (name: string, args: string): boolean => {
    switch (name) {
      case "help": {
        const lines = slashCommands
          .map((c) => `- \`/${c.name}${c.arg ? " " + c.arg : ""}\` — ${c.desc}`)
          .join("\n");
        pushNote(`**Available commands**\n\n${lines}`);
        return true;
      }
      case "new":
        handleNew();
        return true;
      case "clear":
        if (active)
          persist(
            conversations.map((c) =>
              c.id === active.id ? { ...c, messages: [] } : c,
            ),
          );
        return true;
      case "title": {
        const title = args.trim();
        if (!active) return true;
        if (!title) {
          pushNote(`Current title: **${active.title || "Untitled"}**`);
          return true;
        }
        persist(
          conversations.map((c) =>
            c.id === active.id ? { ...c, title, updatedAt: Date.now() } : c,
          ),
        );
        return true;
      }
      case "model": {
        const q = args.trim().toLowerCase();
        if (!q) {
          pushNote("Usage: `/model <name>`");
          return true;
        }
        const match =
          composerModels.find((m) => m.toLowerCase() === q) ??
          composerModels.find((m) => m.toLowerCase().includes(q));
        if (match) {
          onModelChange(match);
          pushNote(`Switched to **${match}**`);
        } else {
          pushNote(
            isGateway
              ? "Use the model switcher in the composer to change the Gateway model."
              : `No model matching "${args.trim()}".`,
          );
        }
        return true;
      }
      case "retry": {
        if (!active || streaming) return true;
        const lastUser = [...active.messages]
          .reverse()
          .find((m) => m.role === "user");
        if (lastUser) handleSend(lastUser.content, { replaceLast: true });
        return true;
      }
      case "undo": {
        if (!active || streaming) return true;
        persist(
          conversations.map((c) =>
            c.id === active.id
              ? { ...c, messages: c.messages.slice(0, -2), updatedAt: Date.now() }
              : c,
          ),
        );
        return true;
      }
      case "stop":
        if (streaming) handleStop();
        return true;
      default:
        return false;
    }
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
          // Resolve to the chamber's first subsection so it lands on a real
          // tab (e.g. Library → Sanctum) instead of a stale/placeholder one.
          const first = firstSubsection(ch);
          if (first) setSubsection(first);
          closeOnMobile();
        }}
        activeSubsection={subsection}
        onSelectSubsection={(id) => {
          setSubsection(id);
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
        onRename={handleRename}
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
          ) : activeChamber === "library" ? (
            <LibraryView section={subsection} />
          ) : activeChamber === "command" ? (
            <CommandView section={subsection} />
          ) : (
            <ChamberPlaceholder chamber={activeChamber} />
          )}
        </div>

        {/* Approval gate — shown above the composer when a tool needs consent */}
        {pendingApproval && activeChamber === "dialogue" && (
          <ApprovalCard
            approval={pendingApproval}
            onRespond={(choice) => {
              approvalResponse(
                pendingApproval.runId,
                pendingApproval.approvalId,
                choice,
              );
              setPendingApproval(null);
            }}
          />
        )}

        {/* Composer — Dialogue chamber only */}
        {activeChamber === "dialogue" && (
          <Composer
            disabled={noProviders || (streaming && active?.id !== streamingId)}
            streaming={streaming && active?.id === streamingId}
            onSend={handleSend}
            onStop={handleStop}
            commands={slashCommands}
            onCommand={runCommand}
            models={composerModels}
            model={model}
            onModelChange={onModelChange}
            gatewayProfile={isGateway ? "default" : undefined}
          />
        )}
      </main>
    </div>
  );
}

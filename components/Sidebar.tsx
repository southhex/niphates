// components/Sidebar.tsx
"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PanelLeftClose } from "lucide-react";
import {
  CHAMBERS,
  CHAMBER_SUBSECTIONS,
  type ChamberId,
} from "@/components/chambers";
import type { Conversation } from "@/lib/types";

export function Sidebar({
  conversations,
  activeId,
  streamingId,
  unread,
  activeChamber,
  onSelectChamber,
  activeSubsection,
  onSelectSubsection,
  sidebarOpen,
  onCollapse,
  onSelect,
  onNew,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  conversations: Conversation[];
  activeId: string | null;
  streamingId: string | null;
  unread: Set<string>;
  activeChamber: ChamberId;
  onSelectChamber: (id: ChamberId) => void;
  activeSubsection: string;
  onSelectSubsection: (id: string) => void;
  sidebarOpen: boolean;
  onCollapse: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const active = conversations.filter((c) => !c.archived);
  const archived = conversations.filter((c) => c.archived);
  const inDialogue = activeChamber === "dialogue";
  const chamberDef = CHAMBERS.find((c) => c.id === activeChamber)!;
  const subsections = CHAMBER_SUBSECTIONS[activeChamber] ?? [];

  return (
    <>
      {/* Mobile drawer backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={onCollapse}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-[264px] flex-col border-r border-hair bg-paneldk pl-[env(safe-area-inset-left)] transition-all md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } ${
          sidebarOpen ? "md:w-[264px]" : "md:w-0 md:overflow-hidden md:border-r-0"
        }`}
      >
        {/* Brand row — no divider; top inset clears the notch */}
        <div className="flex items-center justify-between px-4 pb-[13px] pt-[calc(13px+env(safe-area-inset-top))]">
          <span className="font-display text-[18px] font-semibold uppercase tracking-[0.14em] text-marble">
            NIPHATES
          </span>
          <button
            onClick={onCollapse}
            aria-label="Collapse sidebar"
            className="flex h-7 w-7 items-center justify-center text-muted hover:text-marble"
          >
            <PanelLeftClose size={16} />
          </button>
        </div>

        {/* Chamber nav — type-only active indicator */}
        <nav className="border-b border-hair px-[9px] pb-[9px] pt-1">
          {CHAMBERS.map((c) => {
            const isActive = c.id === activeChamber;
            return (
              <button
                key={c.id}
                onClick={() => onSelectChamber(c.id)}
                className="flex w-full items-center justify-between px-[11px] py-2"
              >
                <span
                  className={`font-mono text-[11.5px] uppercase tracking-[0.2em] ${
                    isActive ? "text-marble" : "text-muted"
                  }`}
                >
                  {c.name}
                </span>
                <span
                  className={`font-display text-[14px] tracking-[0.05em] ${
                    isActive ? "text-gold" : "text-mutedlo"
                  }`}
                  style={
                    isActive
                      ? { textShadow: "0 0 10px rgba(201,162,75,0.55)" }
                      : undefined
                  }
                >
                  {c.numeral}
                </span>
              </button>
            );
          })}
        </nav>

        {inDialogue ? (
          <>
            {/* New dialogue */}
            <div className="px-3 pt-3">
              <button
                onClick={onNew}
                className="btn-ghost-gold w-full px-3 py-2.5 font-mono text-[12px] uppercase tracking-[0.18em] md:py-2 md:text-[10.5px]"
              >
                ❯ NEW DIALOGUE
              </button>
            </div>

            {/* Conversation list (active) — flex-1 pushes Archived to the bottom */}
            <nav className="mt-2 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
              {active.length === 0 && archived.length === 0 && (
                <p className="px-2 py-4 font-mono text-[11px] text-mutedlo">
                  No dialogues yet.
                </p>
              )}
              {active.map((c) => (
                <ChatRow
                  key={c.id}
                  c={c}
                  activeId={activeId}
                  streamingId={streamingId}
                  unread={unread}
                  onSelect={onSelect}
                  onArchive={onArchive}
                  onUnarchive={onUnarchive}
                  onDelete={onDelete}
                />
              ))}
            </nav>

            {/* Archived — pinned above the bottom edge (8px 13px 20px) */}
            {archived.length > 0 && (
              <details className="group/arch border-t border-hair">
                <summary className="cursor-pointer list-none px-[13px] pb-5 pt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted hover:text-parch">
                  <span className="inline-block transition group-open/arch:rotate-90">
                    ▸
                  </span>{" "}
                  ARCHIVED · {archived.length}
                </summary>
                <div className="max-h-48 overflow-y-auto px-2 pb-2">
                  {archived.map((c) => (
                    <ChatRow
                      key={c.id}
                      c={c}
                      activeId={activeId}
                      streamingId={streamingId}
                      unread={unread}
                      onSelect={onSelect}
                      onArchive={onArchive}
                      onUnarchive={onUnarchive}
                      onDelete={onDelete}
                    />
                  ))}
                </div>
              </details>
            )}
          </>
        ) : subsections.length > 0 ? (
          /* Chamber subsections — the active chamber's main tabs */
          <nav className="flex-1 overflow-y-auto overscroll-contain px-2 pt-3">
            {subsections.map((s) => {
              const isActive = s.id === activeSubsection;
              return (
                <button
                  key={s.id}
                  onClick={() => onSelectSubsection(s.id)}
                  className={`flex w-full items-center border-l-2 px-3 py-2.5 text-left font-mono text-[12.5px] uppercase tracking-[0.16em] transition-colors md:py-2 ${
                    isActive
                      ? "border-gold bg-panel text-gold"
                      : "border-transparent text-muted hover:text-marble"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </nav>
        ) : (
          /* No subsections defined yet for this chamber */
          <div className="px-4 pt-4">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.24em] text-mutedlo">
              {chamberDef.name}
            </div>
            <p className="mt-2 font-read italic text-[13px] text-muted">
              Not yet built.
            </p>
          </div>
        )}
      </aside>
    </>
  );
}

function ChatRow({
  c,
  activeId,
  streamingId,
  unread,
  onSelect,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  c: Conversation;
  activeId: string | null;
  streamingId: string | null;
  unread: Set<string>;
  onSelect: (id: string) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [anchor, setAnchor] = useState<{
    top: number;
    bottom: number;
    right: number;
  } | null>(null);
  const [placement, setPlacement] = useState<"below" | "above">("below");
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isActive = c.id === activeId;
  const summoning = c.id === streamingId;
  const unseen = unread.has(c.id);
  const showIndicator = summoning || unseen;

  useEffect(() => {
    setMounted(true);
  }, []);

  const openMenu = () => {
    if (!menuOpen && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setAnchor({ top: r.top, bottom: r.bottom, right: r.right });
      setPlacement("below");
    }
    setMenuOpen((v) => !v);
  };

  // Position the portaled menu, flipping it above the button when there's no
  // room below (bottom-pinned archived rows). Portaling to <body> also frees it
  // from the sidebar list's overflow-y-auto clipping. Runs before paint.
  useLayoutEffect(() => {
    if (!menuOpen || !anchor || !menuRef.current) return;
    const margin = 8;
    const spaceBelow = window.innerHeight - anchor.bottom - margin;
    const h = menuRef.current.scrollHeight;
    setPlacement(
      h > spaceBelow && anchor.top - margin > spaceBelow ? "above" : "below",
    );
  }, [menuOpen, anchor]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const handleDelete = () => {
    setMenuOpen(false);
    if (window.confirm(`Delete "${c.title}"? This can't be undone.`)) {
      onDelete(c.id);
    }
  };

  const menu =
    menuOpen && anchor ? (
      <div
        ref={menuRef}
        role="menu"
        style={{
          position: "fixed",
          right: Math.max(8, window.innerWidth - anchor.right),
          zIndex: 9999,
          ...(placement === "above"
            ? { bottom: window.innerHeight - anchor.top + 4 }
            : { top: anchor.bottom + 4 }),
        }}
        className="w-36 overflow-hidden border border-hairlit bg-panel py-1 text-sm shadow-lg"
      >
        {c.archived ? (
          <button
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              onUnarchive(c.id);
            }}
            className="block w-full px-3 py-2.5 text-left font-mono text-[14px] uppercase tracking-[0.1em] md:py-1.5 md:text-[12px] text-parchdk hover:bg-panel2"
          >
            UNARCHIVE
          </button>
        ) : (
          <button
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              onArchive(c.id);
            }}
            className="block w-full px-3 py-2.5 text-left font-mono text-[14px] uppercase tracking-[0.1em] md:py-1.5 md:text-[12px] text-parchdk hover:bg-panel2"
          >
            ARCHIVE
          </button>
        )}
        <button
          role="menuitem"
          onClick={handleDelete}
          className="block w-full px-3 py-2.5 text-left font-mono text-[14px] uppercase tracking-[0.1em] md:py-1.5 md:text-[12px] text-carnelian hover:bg-panel2"
        >
          DELETE
        </button>
      </div>
    ) : null;

  return (
    <div
      ref={ref}
      className={`group relative flex items-center gap-1 border-l-2 px-2 ${
        isActive
          ? "border-gold bg-panel text-marble"
          : "border-transparent text-muted hover:text-parch"
      }`}
    >
      <button
        onClick={() => onSelect(c.id)}
        className="flex-1 truncate py-2.5 text-left font-mono text-[15px] md:py-2 md:text-[12.5px]"
        title={c.title}
      >
        {c.title}
      </button>
      <span className="flex shrink-0 items-center gap-1">
        {showIndicator && (
          <span
            className={`status-dot status-dot-gold ${
              summoning ? "glow-pulse" : ""
            }`}
            title={summoning ? "summoning" : "unseen reply"}
          />
        )}
        <button
          ref={btnRef}
          onClick={openMenu}
          className={`px-2 py-1 text-[18px] leading-none text-muted transition hover:text-marble md:px-1 md:text-base ${
            menuOpen
              ? "opacity-100"
              : "opacity-100 md:opacity-0 md:group-hover:opacity-100"
          }`}
          aria-label="Conversation options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          ⋯
        </button>
      </span>

      {mounted && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}

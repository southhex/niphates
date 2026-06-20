"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Conversation } from "@/lib/types";

export function Sidebar({
  conversations,
  activeId,
  open,
  onSelect,
  onNew,
  onArchive,
  onUnarchive,
  onDelete,
  onClose,
}: {
  conversations: Conversation[];
  activeId: string | null;
  open: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const active = conversations.filter((c) => !c.archived);
  const archived = conversations.filter((c) => c.archived);
  const [theme, setTheme] = useState<"obsidian" | "marble">("obsidian");

  useEffect(() => {
    const stored = localStorage.getItem("niphates-theme") as
      | "obsidian"
      | "marble"
      | null;
    if (stored) setTheme(stored);
  }, []);

  const toggleTheme = (t: "obsidian" | "marble") => {
    setTheme(t);
    localStorage.setItem("niphates-theme", t);
    document.documentElement.setAttribute("data-theme", t);
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-[264px] flex-col border-r border-hair bg-paneldk transition-transform md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand */}
        <div className="flex items-center justify-between border-b border-hair px-4 py-3">
          <span className="font-display text-[18px] font-semibold uppercase tracking-[0.14em] text-marble">
            NIPHATES
          </span>
          <span
            className="font-display text-[13px]"
            style={{ color: "rgba(201,162,75,0.6)" }}
          >
            IV
          </span>
        </div>

        {/* New dialogue */}
        <div className="px-3 pt-3">
          <button
            onClick={onNew}
            className="btn-ghost-gold w-full px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.18em]"
          >
            ❯ NEW DIALOGUE
          </button>
        </div>

        {/* Conversation list */}
        <nav className="mt-2 flex-1 overflow-y-auto px-2 pb-2">
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
              onSelect={onSelect}
              onArchive={onArchive}
              onUnarchive={onUnarchive}
              onDelete={onDelete}
            />
          ))}

          {archived.length > 0 && (
            <details className="mt-2 group/arch">
              <summary className="cursor-pointer list-none border-t border-hair px-2 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted hover:text-parch">
                <span className="inline-block transition group-open/arch:rotate-90">
                  ▸
                </span>{" "}
                ARCHIVED · {archived.length}
              </summary>
              <div className="mt-1">
                {archived.map((c) => (
                  <ChatRow
                    key={c.id}
                    c={c}
                    activeId={activeId}
                    onSelect={onSelect}
                    onArchive={onArchive}
                    onUnarchive={onUnarchive}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            </details>
          )}
        </nav>

        {/* Footer */}
        <div className="space-y-0.5 border-t border-hair p-3">
          <Link
            href="/hermes"
            className="block px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-parch hover:bg-panel hover:text-marble"
          >
            ⚡ CONTROL
          </Link>
          <Link
            href="/settings"
            className="block px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-parch hover:bg-panel hover:text-marble"
          >
            ⚙ SETTINGS
          </Link>

          {/* Theme toggle */}
          <div className="mt-2 flex border border-hair">
            <button
              onClick={() => toggleTheme("obsidian")}
              className={`flex-1 px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors ${
                theme === "obsidian"
                  ? "bg-gold text-goldink"
                  : "text-muted hover:text-marble"
              }`}
            >
              ☾ OBSIDIAN
            </button>
            <button
              onClick={() => toggleTheme("marble")}
              className={`flex-1 border-l border-hair px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors ${
                theme === "marble"
                  ? "bg-gold text-goldink"
                  : "text-muted hover:text-marble"
              }`}
            >
              ☀ MARBLE
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function ChatRow({
  c,
  activeId,
  onSelect,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  c: Conversation;
  activeId: string | null;
  onSelect: (id: string) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isActive = c.id === activeId;

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
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
        className="flex-1 truncate py-2 text-left font-mono text-[12.5px]"
        title={c.title}
      >
        {c.title}
      </button>
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className={`px-1 text-muted transition hover:text-marble ${
          menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
        aria-label="Conversation options"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        ⋯
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-1 top-9 z-40 w-36 overflow-hidden border border-hairlit bg-panel py-1 text-sm shadow-lg"
        >
          {c.archived ? (
            <button
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onUnarchive(c.id);
              }}
              className="block w-full px-3 py-1.5 text-left font-mono text-[12px] uppercase tracking-[0.1em] text-parchdk hover:bg-panel2"
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
              className="block w-full px-3 py-1.5 text-left font-mono text-[12px] uppercase tracking-[0.1em] text-parchdk hover:bg-panel2"
            >
              ARCHIVE
            </button>
          )}
          <button
            role="menuitem"
            onClick={handleDelete}
            className="block w-full px-3 py-1.5 text-left font-mono text-[12px] uppercase tracking-[0.1em] text-carnelian hover:bg-panel2"
          >
            DELETE
          </button>
        </div>
      )}
    </div>
  );
}

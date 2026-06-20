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

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-slate-800 bg-slate-900 transition-transform md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="text-xl">⚡</span>
          <span className="font-semibold">Hermes Chat</span>
        </div>

        <div className="px-3">
          <button
            onClick={onNew}
            className="w-full rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
          >
            + New chat
          </button>
        </div>

        <nav className="mt-3 flex-1 overflow-y-auto px-2">
          {active.length === 0 && archived.length === 0 && (
            <p className="px-2 py-4 text-sm text-slate-500">
              No conversations yet.
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
              <summary className="cursor-pointer list-none px-2 py-2 text-xs font-medium uppercase tracking-wide text-slate-500 hover:text-slate-300">
                <span className="inline-block transition group-open/arch:rotate-90">
                  ▸
                </span>{" "}
                Archived ({archived.length})
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

        <div className="space-y-0.5 border-t border-slate-800 p-3">
          <Link
            href="/hermes"
            className="block rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            ⚡ Hermes Control
          </Link>
          <Link
            href="/settings"
            className="block rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            ⚙ Settings
          </Link>
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

  // Close the menu on any outside click / Escape.
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
      className={`group relative flex items-center gap-1 rounded-lg px-2 ${
        c.id === activeId ? "bg-slate-800" : "hover:bg-slate-800/60"
      }`}
    >
      <button
        onClick={() => onSelect(c.id)}
        className="flex-1 truncate py-2 text-left text-sm text-slate-200"
        title={c.title}
      >
        {c.title}
      </button>
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className={`px-1 text-slate-500 transition hover:text-slate-200 ${
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
          className="absolute right-1 top-9 z-40 w-36 overflow-hidden rounded-lg border border-slate-700 bg-slate-800 py-1 text-sm shadow-lg"
        >
          {c.archived ? (
            <button
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onUnarchive(c.id);
              }}
              className="block w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-700"
            >
              Unarchive
            </button>
          ) : (
            <button
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onArchive(c.id);
              }}
              className="block w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-700"
            >
              Archive
            </button>
          )}
          <button
            role="menuitem"
            onClick={handleDelete}
            className="block w-full px-3 py-1.5 text-left text-red-400 hover:bg-slate-700"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

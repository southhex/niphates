"use client";

import Link from "next/link";
import type { Conversation } from "@/lib/types";

export function Sidebar({
  conversations,
  activeId,
  open,
  onSelect,
  onNew,
  onDelete,
  onClose,
}: {
  conversations: Conversation[];
  activeId: string | null;
  open: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
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
          {conversations.length === 0 && (
            <p className="px-2 py-4 text-sm text-slate-500">No conversations yet.</p>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center gap-1 rounded-lg px-2 ${
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
                onClick={() => onDelete(c.id)}
                className="opacity-0 transition group-hover:opacity-100"
                aria-label="Delete conversation"
              >
                <span className="px-1 text-slate-500 hover:text-red-400">×</span>
              </button>
            </div>
          ))}
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

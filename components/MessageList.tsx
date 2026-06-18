"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/lib/types";

export function MessageList({
  messages,
  streaming,
}: {
  messages: ChatMessage[];
  streaming: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streaming]);

  const visible = messages.filter((m) => m.role !== "system");

  if (visible.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="max-w-md space-y-2 text-slate-400">
          <div className="text-4xl">⚡</div>
          <h2 className="text-lg font-medium text-slate-200">
            Chat with your agents
          </h2>
          <p className="text-sm">
            Pick a provider above and start typing. Hermes Agent is ready out of
            the box — add more providers in Settings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      {visible.map((m, i) => (
        <div
          key={i}
          className={
            m.role === "user" ? "flex justify-end" : "flex justify-start"
          }
        >
          <div
            className={
              m.role === "user"
                ? "max-w-[85%] rounded-2xl rounded-br-sm bg-amber-500/90 px-4 py-2.5 text-slate-950"
                : "max-w-[85%] rounded-2xl rounded-bl-sm bg-slate-800/80 px-4 py-2.5 text-slate-100"
            }
          >
            <div className="msg-content text-[0.95rem]">
              {m.content || (streaming && i === visible.length - 1 ? "▍" : "")}
            </div>
          </div>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

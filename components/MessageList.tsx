"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
      {visible.map((m, i) => {
        const isUser = m.role === "user";
        const isLast = i === visible.length - 1;
        const waiting = !isUser && !m.content && streaming && isLast;
        return (
          <div
            key={i}
            className={isUser ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={
                isUser
                  ? "max-w-[85%] rounded-2xl rounded-br-sm bg-amber-500/90 px-4 py-2.5 text-slate-950"
                  : "max-w-[85%] rounded-2xl rounded-bl-sm bg-slate-800/80 px-4 py-2.5 text-slate-100"
              }
            >
              {waiting ? (
                <Thinking />
              ) : isUser ? (
                <div className="msg-content text-[0.95rem] whitespace-pre-wrap break-words">
                  {m.content}
                </div>
              ) : (
                <div className="msg-content text-[0.95rem]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {m.content}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

function Thinking() {
  return (
    <div className="flex items-center gap-2 py-0.5 text-slate-400">
      <span
        className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-amber-400"
        aria-hidden="true"
      />
      <span className="text-sm">Thinking…</span>
    </div>
  );
}

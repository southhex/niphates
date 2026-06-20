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
        <div className="max-w-md">
          <div className="mb-6 font-mono text-[11px] uppercase tracking-[0.34em] text-lapis">
            ❯ THE MIND IS ITS OWN PLACE
          </div>
          <h1 className="mb-4 font-display text-[46px] font-semibold uppercase tracking-[0.1em] text-marble">
            NIPHATES
          </h1>
          <div
            className="mx-auto mb-5 h-px w-48"
            style={{
              background:
                "linear-gradient(to right, transparent, var(--gold), transparent)",
            }}
          />
          <p className="font-read italic text-[16px] text-parch">
            Summon the agent. Hermes is ready out of the box — add more
            providers in Settings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-4 py-6 pb-8 md:gap-7 md:px-6 md:py-[34px] md:pb-10">
      {visible.map((m, i) => {
        const isUser = m.role === "user";
        const isLast = i === visible.length - 1;
        const waiting = !isUser && !m.content && streaming && isLast;

        if (isUser) {
          return (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] border-r-2 border-gold pr-4 md:max-w-[75%]">
                <div className="mb-1 text-right font-mono text-[12px] uppercase tracking-[0.28em] text-gold md:text-[10.5px]">
                  OPERATOR
                </div>
                <div className="whitespace-pre-wrap break-words font-mono text-[16px] text-parchdk md:text-[14px]">
                  {m.content}
                </div>
              </div>
            </div>
          );
        }

        return (
          <div key={i} className="flex justify-start">
            <div className="max-w-[85%] border-l-2 border-porphyry pl-4 md:max-w-[75%]">
              <div className="mb-1 font-mono text-[12px] uppercase tracking-[0.28em] text-porphlbl md:text-[10.5px]">
                NIPHATES
              </div>
              {waiting ? (
                <div className="flex items-center gap-3">
                  <span
                    className="status-dot status-dot-gold glow-pulse"
                    aria-hidden="true"
                  />
                  <span className="font-read italic text-[16px] text-parch">
                    summoning…
                  </span>
                </div>
              ) : (
                <div className="msg-content font-read text-[18px] leading-[1.62] text-agentbody">
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

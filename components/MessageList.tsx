"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "@/lib/types";
import { mergeAdjacentText } from "@/lib/blocks";
import { Spinner } from "@/components/Spinner";
import { CopyButton } from "@/components/CopyButton";
import { ReasoningBlock } from "@/components/ReasoningBlock";
import { ToolCard } from "@/components/ToolCard";

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
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-6 pt-[26px] pb-8">
      {visible.map((m, i) => {
        const isUser = m.role === "user";
        const isLast = i === visible.length - 1;
        const waiting = !isUser && !m.content && streaming && isLast;

        if (isUser) {
          return (
            <div key={i} className="ml-16 border border-hair bg-panel px-4 py-3.5">
              <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.28em] text-gold">
                OPERATOR
              </div>
              <div className="whitespace-pre-wrap break-words font-mono text-[14px] text-parchdk">
                {m.content}
              </div>
            </div>
          );
        }

        return (
          <div key={i}>
            <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.28em] text-porphlbl">
              NIPHATES
            </div>
            {waiting ? (
              <div className="flex items-center gap-2.5 text-gold">
                <Spinner className="text-[15px]" />
                <span className="font-read italic text-[16px] text-parch">
                  summoning…
                </span>
              </div>
            ) : (
              <BlockRenderer
                m={m}
                streaming={streaming}
                isLast={isLast}
              />
            )}
            {!streaming && m.content && (
              <div className="mt-1 flex justify-end">
                <CopyButton
                  text={() => m.content}
                  label="Copy message"
                />
              </div>
            )}
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

/**
 * Render an assistant message as a chronological list of blocks when `blocks`
 * is present, falling back to the legacy flat layout (reasoning → tools →
 * text) for older messages persisted before this feature shipped. Adjacent
 * text blocks are merged into a single ReactMarkdown render so the user sees
 * one continuous answer instead of fragmented pieces.
 */
function BlockRenderer({
  m,
  streaming,
  isLast,
}: {
  m: ChatMessage;
  streaming: boolean;
  isLast: boolean;
}) {
  // Fall back to the legacy layout for messages persisted before `blocks` existed
  if (!m.blocks || m.blocks.length === 0) {
    return <LegacyAssistantContent m={m} streaming={streaming} isLast={isLast} />;
  }

  const merged = mergeAdjacentText(m.blocks);

  return (
    <>
      {merged.map((block, i) => {
        const isLastBlock = i === merged.length - 1;
        const tailStreaming = streaming && isLast && isLastBlock;

        if (block.type === "text") {
          if (!block.text) return null;
          return (
            <div
              key={i}
              className="msg-content font-read text-[16px] leading-[1.62] text-agentbody"
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{ code: CodeComponent }}
              >
                {block.text}
              </ReactMarkdown>
            </div>
          );
        }
        if (block.type === "reasoning") {
          return (
            <ReasoningBlock
              key={i}
              text={block.text}
              streaming={tailStreaming}
            />
          );
        }
        // tool block
        return (
          <div key={i} className="mb-2">
            <ToolCard event={block} streaming={tailStreaming} />
          </div>
        );
      })}
    </>
  );
}

/** Old-style layout for conversations persisted before the `blocks` field existed. */
function LegacyAssistantContent({
  m,
  streaming,
  isLast,
}: {
  m: ChatMessage;
  streaming: boolean;
  isLast: boolean;
}) {
  const isLastTool = (idx: number) =>
    streaming && isLast && idx === (m.toolCalls?.length ?? 0) - 1;

  return (
    <>
      {m.reasoning ? <ReasoningBlock text={m.reasoning} /> : null}
      {m.toolCalls && m.toolCalls.length > 0 ? (
        <div className="mb-2 flex flex-col gap-1">
          {m.toolCalls.map((t, ti) => (
            <ToolCard
              key={ti}
              event={t}
              streaming={isLastTool(ti)}
            />
          ))}
        </div>
      ) : null}
      <div className="msg-content font-read text-[16px] leading-[1.62] text-agentbody">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{ code: CodeComponent }}
        >
          {m.content}
        </ReactMarkdown>
      </div>
    </>
  );
}

/**
 * Custom `code` component for ReactMarkdown. Inline code (no language class)
 * is rendered as-is. Fenced code blocks get a relative wrapper and a hover
 * overlay containing a `CopyButton` so users can grab the snippet without
 * selecting text. The `.msg-content pre` rules in `globals.css` still apply —
 * the copy button sits absolutely positioned over the top-right corner.
 */
function CodeComponent({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const isBlock = className?.includes("language-");
  // ReactMarkdown hands the raw children of a fenced block through, which
  // includes the trailing newline that terminates the code line. Strip it so
  // "Copy" gives the user a clean snippet instead of one with stray whitespace.
  const text = String(children ?? "").replace(/\n$/, "");
  if (!isBlock) {
    return <code className={className}>{children}</code>;
  }
  return (
    <div className="group/code relative">
      <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover/code:opacity-100">
        <CopyButton text={text} iconSize={11} />
      </div>
      <pre>
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

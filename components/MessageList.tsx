"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "@/lib/types";
import type { ToolBlock } from "@/lib/blocks";
import { groupToolRuns, hoistReasoning, mergeAdjacentText } from "@/lib/blocks";
import { CopyButton } from "@/components/CopyButton";
import { ReasoningBlock } from "@/components/ReasoningBlock";
import { ToolCard } from "@/components/ToolCard";
import { TurnTimer } from "@/components/TurnTimer";

const MAX_CLUSTER = 6;

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

  // The empty-conversation hero (and the composer beneath it) is rendered by
  // page.tsx, not here — MessageList only draws once there's a visible message.
  const visible = messages.filter((m) => m.role !== "system");

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-4 px-5 pt-[18px] pb-6">
      {visible.map((m, i) => {
        const isUser = m.role === "user";
        const isLast = i === visible.length - 1;

        if (isUser) {
          return (
            <div
              key={i}
              className="group/op relative ml-16 rounded-[6px] border border-hair bg-panel px-3.5 py-2.5"
            >
              <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover/op:opacity-100">
                <CopyButton text={() => m.content} iconOnly iconSize={12} />
              </div>
              <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.28em] text-gold">
                OPERATOR
              </div>
              <div className="whitespace-pre-wrap break-words font-mono text-[13px] text-parchdk">
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
            <BlockRenderer m={m} streaming={streaming} isLast={isLast} />
            <TurnTimer active={isLast && streaming} />
            {!streaming && m.content && (
              <div className="mt-0.5 flex justify-end">
                <CopyButton text={() => m.content} iconOnly iconSize={12} />
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

  const grouped = groupToolRuns(mergeAdjacentText(hoistReasoning(m.blocks)));

  return (
    <>
      {grouped.map((block, i) => {
        const isLastBlock = i === grouped.length - 1;
        const tailStreaming = streaming && isLast && isLastBlock;

        if (block.type === "text") {
          if (!block.text) return null;
          return (
            <div
              key={i}
              className="msg-content font-read text-[15px] leading-[1.6] text-agentbody"
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
        if (block.type === "tool-group") {
          return <ToolGroup key={i} items={block.items} />;
        }
        // lone tool block (not part of a run)
        return (
          <div key={i} className="mb-1.5">
            <ToolCard event={block} streaming={tailStreaming} />
          </div>
        );
      })}
    </>
  );
}

/**
 * A tight-gap cluster of consecutive tool lines. When more than `MAX_CLUSTER`
 * tools ran in a row, only the first `MAX_CLUSTER` show, followed by a dimmed
 * "+k more" toggle that reveals the rest in place (plain show/hide).
 */
function ToolGroup({ items }: { items: ToolBlock[] }) {
  const [expanded, setExpanded] = useState(false);
  const overflow = items.length - MAX_CLUSTER;
  const shown = expanded ? items : items.slice(0, MAX_CLUSTER);

  return (
    <div className="mb-1.5 flex flex-col">
      {shown.map((t, i) => (
        <ToolCard key={i} event={t} />
      ))}
      {overflow > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="py-0.5 pl-[24px] pr-2.5 text-left font-mono text-[11px] text-mutedlo hover:text-parch"
        >
          {expanded ? "− show less" : `+${overflow} more`}
        </button>
      )}
    </div>
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
      <div className="msg-content font-read text-[15px] leading-[1.6] text-agentbody">
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

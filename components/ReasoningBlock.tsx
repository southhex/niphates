"use client";

import { useState } from "react";
import { ChevronRight, Brain } from "lucide-react";
import { CopyButton } from "./CopyButton";

/**
 * Collapsible reasoning/thinking block. Folded by default (matches Hermes'
 * native client) and reveals the full reasoning text on click. While
 * `streaming` is true the label and the brain icon get a soft glow-pulse
 * animation so the user can see the agent is still thinking, but the body
 * stays collapsed — they have to opt in to read it.
 */
export function ReasoningBlock({
  text,
  streaming = false,
}: {
  text: string;
  streaming?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-2 border-l-2 border-hair pl-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.24em] text-mutedlo transition-colors hover:text-parch"
      >
        <ChevronRight
          size={12}
          className={`transition-transform ${open ? "rotate-90" : ""}`}
        />
        <Brain size={11} className={streaming ? "glow-pulse" : ""} />
        <span className={streaming ? "glow-pulse" : ""}>Reasoning</span>
      </button>
      {open && (
        <div className="group/reasoning relative mt-1.5">
          <div className="whitespace-pre-wrap font-read text-[14px] italic leading-[1.55] text-parch pr-16">
            {text}
          </div>
          <div className="mt-1.5">
            <CopyButton text={text} />
          </div>
        </div>
      )}
    </div>
  );
}

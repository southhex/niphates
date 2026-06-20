"use client";

import { useRef, useState } from "react";

export function Composer({
  disabled,
  streaming,
  onSend,
  onStop,
}: {
  disabled: boolean;
  streaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const [value, setValue] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  const grow = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  };

  const submit = () => {
    const text = value.trim();
    if (!text || streaming) return;
    onSend(text);
    setValue("");
    requestAnimationFrame(() => {
      if (taRef.current) taRef.current.style.height = "auto";
    });
  };

  return (
    <div className="border-t border-hair bg-paneldk pl-[calc(1rem+env(safe-area-inset-left))] pr-[calc(1rem+env(safe-area-inset-right))] pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <div className="mx-auto flex w-full max-w-[760px] items-end gap-2">
        {/* Terminal field */}
        <div className="term-field flex flex-1 items-start gap-2 px-3 py-3 md:py-2.5">
          <span
            className="mt-0.5 select-none font-mono text-[16px] text-gold md:text-[13.5px]"
            aria-hidden="true"
          >
            ❯
          </span>
          <textarea
            ref={taRef}
            value={value}
            disabled={disabled}
            rows={1}
            placeholder={
              disabled ? "Add a provider in Settings first…" : "summon the agent…"
            }
            onChange={(e) => {
              setValue(e.target.value);
              grow();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            className="max-h-52 flex-1 resize-none bg-transparent font-mono text-[16px] text-marble outline-none placeholder:text-mutedlo disabled:opacity-50 md:text-[13.5px]"
          />
        </div>

        {streaming ? (
          <button
            onClick={onStop}
            className="border border-hair px-4 py-3 font-mono text-[12px] uppercase tracking-[0.18em] text-parch hover:border-carnelian hover:text-carnelian md:py-2.5 md:text-[11px]"
          >
            STOP
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={disabled || !value.trim()}
            className="btn-gold px-4 py-3 font-mono text-[12px] uppercase tracking-[0.18em] disabled:cursor-not-allowed disabled:opacity-40 md:py-2.5 md:text-[11px]"
          >
            SEND
          </button>
        )}
      </div>
    </div>
  );
}

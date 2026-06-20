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
    <div className="border-t border-hair bg-paneldk px-4 py-3">
      <div className="mx-auto flex w-full max-w-[760px] items-end gap-2">
        {/* Terminal field */}
        <div className="term-field flex flex-1 items-start gap-2 px-3 py-2.5">
          <span
            className="mt-0.5 select-none font-mono text-[13.5px] text-gold"
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
            className="max-h-52 flex-1 resize-none bg-transparent font-mono text-[13.5px] text-marble outline-none placeholder:text-mutedlo disabled:opacity-50"
          />
        </div>

        {streaming ? (
          <button
            onClick={onStop}
            className="border border-hair px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-parch hover:border-carnelian hover:text-carnelian"
          >
            STOP
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={disabled || !value.trim()}
            className="btn-gold px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] disabled:cursor-not-allowed disabled:opacity-40"
          >
            SEND
          </button>
        )}
      </div>
    </div>
  );
}

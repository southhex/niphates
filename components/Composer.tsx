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
    <div className="border-t border-slate-800 bg-slate-950/80 px-3 py-3 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
        <textarea
          ref={taRef}
          value={value}
          disabled={disabled}
          rows={1}
          placeholder={disabled ? "Add a provider in Settings first…" : "Message…"}
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
          className="max-h-52 flex-1 resize-none rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-[0.95rem] outline-none placeholder:text-slate-500 focus:border-amber-500 disabled:opacity-50"
        />
        {streaming ? (
          <button
            onClick={onStop}
            className="rounded-2xl bg-slate-700 px-4 py-3 text-sm font-medium text-slate-100 hover:bg-slate-600"
            aria-label="Stop generating"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={disabled || !value.trim()}
            className="rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send message"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}

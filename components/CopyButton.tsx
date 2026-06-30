"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Check, X } from "lucide-react";

/**
 * Ghost-style copy-to-clipboard button with transient success/error feedback.
 * Used on message bodies, fenced code blocks, and tool previews. The button
 * shows the requested label by default, swaps to "Copied" (with a check icon)
 * for 1.5s after a successful copy, or "Failed" (with an X) if the clipboard
 * write was rejected. Theme-aware colors: muted by default, parchment on
 * hover, malachite on success, carnelian on error.
 *
 * Accepts either a plain string or a thunk — the thunk form is useful for
 * `text={() => m.content}` so the value is read at click time, not at render.
 */
export function CopyButton({
  text,
  label = "Copy",
  className = "",
  iconSize = 13,
}: {
  text: string | (() => string);
  label?: string;
  className?: string;
  iconSize?: number;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const resetRef = useRef<number | null>(null);

  // Clear any pending reset on unmount so we don't call setState on a dead
  // component if the user navigates away mid-feedback.
  useEffect(
    () => () => {
      if (resetRef.current) window.clearTimeout(resetRef.current);
    },
    [],
  );

  const copy = useCallback(async () => {
    try {
      const value = typeof text === "function" ? text() : text;
      if (!value) return;
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
    if (resetRef.current) window.clearTimeout(resetRef.current);
    resetRef.current = window.setTimeout(() => setStatus("idle"), 1500);
  }, [text]);

  const Icon = status === "copied" ? Check : status === "error" ? X : Copy;
  const colorClass =
    status === "copied"
      ? "text-malach"
      : status === "error"
        ? "text-carnelian"
        : "";

  return (
    <button
      type="button"
      aria-label={label}
      onClick={copy}
      className={`inline-flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-[0.2em] text-mutedlo transition-colors hover:text-parch ${colorClass} ${className}`}
    >
      <Icon size={iconSize} />
      {status === "copied" ? "Copied" : status === "error" ? "Failed" : label}
    </button>
  );
}

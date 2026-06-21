"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clampLeft } from "@/lib/dropdownPlacement";

export interface SelectOption {
  value: string;
  label: string;
}

interface Anchor {
  top: number;
  bottom: number;
  left: number;
  minWidth: number;
}

export function Select({
  value,
  onChange,
  options,
  disabled = false,
  placeholder,
  triggerClassName = "",
  valueClassName = "",
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  placeholder?: string;
  triggerClassName?: string;
  valueClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [placement, setPlacement] = useState<"below" | "above">("below");
  const [left, setLeft] = useState(0);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => { setMounted(true); }, []);

  const openDropdown = () => {
    if (disabled) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setAnchor({
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        minWidth: Math.max(rect.width, 120),
      });
      setPlacement("below"); // assume below; the layout effect flips if it'd overflow
      setLeft(rect.left); // start aligned to the trigger; clamped after measuring
    }
    setOpen(true);
  };

  // Flip the menu above the trigger when it would run off the bottom of the
  // viewport (e.g. the model selector docked in the composer). Runs before
  // paint so there's no visible jump.
  useLayoutEffect(() => {
    if (!open || !anchor || !dropdownRef.current) return;
    const margin = 8;
    const spaceBelow = window.innerHeight - anchor.bottom - margin;
    const spaceAbove = anchor.top - margin;
    const contentHeight = dropdownRef.current.scrollHeight;
    setPlacement(
      contentHeight > spaceBelow && spaceAbove > spaceBelow ? "above" : "below",
    );
    // Keep the menu within the viewport horizontally (the model selector sits
    // near the right edge on a phone, so a wide menu would bleed off-screen).
    setLeft(
      clampLeft(
        anchor.left,
        dropdownRef.current.offsetWidth,
        window.innerWidth,
        margin,
      ),
    );
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (dropdownRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = current?.label ?? placeholder ?? value;
  const margin = 8;

  const dropdown =
    open && anchor && options.length > 0 ? (
      <div
        ref={dropdownRef}
        role="listbox"
        style={{
          position: "fixed",
          left,
          minWidth: anchor.minWidth,
          maxWidth: window.innerWidth - 2 * margin,
          zIndex: 9999,
          maxHeight:
            (placement === "above"
              ? anchor.top
              : window.innerHeight - anchor.bottom) - margin,
          overflowY: "auto",
          ...(placement === "above"
            ? { bottom: window.innerHeight - anchor.top }
            : { top: anchor.bottom }),
        }}
        className="border border-hairlit bg-panel2 shadow-lg"
      >
        {options.map((o) => (
          <button
            key={o.value}
            role="option"
            type="button"
            aria-selected={o.value === value}
            onClick={() => {
              onChange(o.value);
              setOpen(false);
            }}
            className={`block w-full truncate px-3 py-2.5 text-left font-mono text-[14px] hover:bg-panel2 md:py-2 md:text-[12.5px] ${
              o.value === value ? "text-gold" : "text-parchdk"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    ) : null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={openDropdown}
        className={`flex items-center gap-1.5 outline-none disabled:opacity-50 ${triggerClassName}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`font-mono text-[14px] md:text-[12.5px] ${valueClassName}`}>
          {label}
        </span>
        <span
          className={`select-none font-mono text-xs text-muted transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>

      {mounted && dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface SelectOption {
  value: string;
  label: string;
}

interface DropdownPos {
  top: number;
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
  const [pos, setPos] = useState<DropdownPos | null>(null);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => { setMounted(true); }, []);

  const openDropdown = () => {
    if (disabled) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setPos({
        top: rect.bottom,
        left: rect.left,
        minWidth: Math.max(rect.width, 120),
      });
    }
    setOpen(true);
  };

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

  const dropdown =
    open && pos && options.length > 0 ? (
      <div
        ref={dropdownRef}
        role="listbox"
        style={{
          position: "fixed",
          top: pos.top,
          left: pos.left,
          minWidth: pos.minWidth,
          zIndex: 9999,
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
            className={`block w-full px-3 py-2.5 text-left font-mono text-[14px] hover:bg-panel2 md:py-2 md:text-[12.5px] ${
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

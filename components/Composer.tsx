// components/Composer.tsx
"use client";

import { useCallback, useRef, useState } from "react";
import { Plus, Mic, Square } from "lucide-react";
import { Select } from "@/components/Select";
import { ComposerModelSwitch } from "@/components/ComposerModelSwitch";

// ---------------------------------------------------------------------------
// Slash-command types
// ---------------------------------------------------------------------------

/** A slash command the composer can autocomplete and dispatch. The registry
 *  and the handlers live in the parent (app/page.tsx) where conversation state
 *  is — the composer only renders the picker and parses input. */
export interface SlashCommandSpec {
  name: string;
  desc: string;
  /** Argument hint shown in the picker, e.g. "[title]" or "name". */
  arg?: string;
}

// ---------------------------------------------------------------------------
// Command picker
// ---------------------------------------------------------------------------

function CommandPicker({
  matched,
  activeIndex,
  onSelect,
}: {
  matched: SlashCommandSpec[];
  activeIndex: number;
  onSelect: (cmd: SlashCommandSpec) => void;
}) {
  if (matched.length === 0) return null;
  return (
    <div className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-[280px] overflow-y-auto border border-hair bg-base shadow-lg">
      {matched.map((cmd, i) => (
        <button
          key={cmd.name}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault(); // keep textarea focus
            onSelect(cmd);
          }}
          className={`flex w-full items-baseline gap-2 px-4 py-2 text-left font-mono text-[12px] hover:bg-panel ${
            i === activeIndex ? "bg-panel" : ""
          }`}
        >
          <span className="text-gold">/{cmd.name}</span>
          {cmd.arg && <span className="text-mutedlo">{cmd.arg}</span>}
          <span className="ml-auto truncate pl-3 text-mutedlo">{cmd.desc}</span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------

export function Composer({
  disabled,
  streaming,
  onSend,
  onStop,
  commands,
  onCommand,
  models,
  model,
  onModelChange,
  gatewayProfile,
}: {
  disabled: boolean;
  streaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  /** Slash commands to autocomplete in the picker. */
  commands: SlashCommandSpec[];
  /** Dispatch a slash command. Return true if handled locally (input is
   *  cleared, nothing is sent); return false to fall through and send the raw
   *  text to the agent (e.g. an unknown command). */
  onCommand: (name: string, args: string) => boolean;
  models: string[];
  model: string;
  onModelChange: (m: string) => void;
  /** When set (Gateway provider active), shows the inline model switcher for
   *  this profile. The composer `model` above is the *profile*; this switches
   *  that profile's underlying LLM. */
  gatewayProfile?: string;
}) {
  const [value, setValue] = useState("");
  const [pickerIndex, setPickerIndex] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Picker is active while typing a single "/word" token (no space yet).
  const isSlash = value.startsWith("/") && !value.includes(" ");
  const slashFilter = isSlash ? value.slice(1).toLowerCase() : "";
  const matched = isSlash
    ? commands.filter((c) => c.name.toLowerCase().startsWith(slashFilter))
    : [];
  const showPicker = matched.length > 0;

  const grow = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  };

  const reset = () => {
    setValue("");
    setPickerIndex(0);
    requestAnimationFrame(() => {
      if (taRef.current) taRef.current.style.height = "auto";
    });
  };

  const submit = useCallback(() => {
    const text = value.trim();
    if (!text || streaming) return;

    // Slash command? Parse "/name args" and let the parent handle it.
    if (text.startsWith("/")) {
      const sp = text.indexOf(" ");
      const name = (sp === -1 ? text.slice(1) : text.slice(1, sp)).toLowerCase();
      const args = sp === -1 ? "" : text.slice(sp + 1).trim();
      const known = commands.some((c) => c.name === name);
      if (known && onCommand(name, args)) {
        reset();
        return;
      }
      // Unknown command (or handler declined) → send as a normal message.
    }

    onSend(text);
    reset();
  }, [value, streaming, onSend, onCommand, commands]);

  const selectCommand = (cmd: SlashCommandSpec) => {
    setValue(`/${cmd.name} `);
    setPickerIndex(0);
    taRef.current?.focus();
  };

  // 30×30 borderless toolbar button: transparent, gold-soft tint on hover.
  const iconBtn =
    "flex h-[30px] w-[30px] items-center justify-center text-parch transition-colors hover:bg-[var(--goldsoft)] hover:text-gold";

  return (
    <div className="pl-[calc(1rem+env(safe-area-inset-left))] pr-[calc(1rem+env(safe-area-inset-right))] pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      {/* zoom 0.9 — scale the whole composer down ~10% (reflows cleanly on WebKit) */}
      <div className="relative mx-auto w-full max-w-[720px]" style={{ zoom: 0.9 }}>
        {/* Command picker — floats above the composer box */}
        {showPicker && (
          <CommandPicker
            matched={matched}
            activeIndex={pickerIndex % matched.length}
            onSelect={selectCommand}
          />
        )}

        {/* Outer box — term-field gives the 1px hairlit border + gold focus glow */}
        <div className="term-field flex flex-col gap-[11px] px-[14px] py-3">
          {/* Row 1 — input. items-start keeps the prompt on the first line when the
              textarea grows; the leading-[20px] on the caret matches the textarea's
              line box so they share a baseline. */}
          <div className="flex items-start gap-2">
            <span
              className="select-none font-mono text-[16px] leading-[20px] text-gold md:text-[14px]"
              aria-hidden="true"
            >
              ❯
            </span>
            <textarea
              ref={taRef}
              value={value}
              disabled={disabled}
              rows={1}
              style={{ minHeight: 20 }}
              placeholder={
                disabled
                  ? "Add a provider in Settings first…"
                  : "summon the agent… or /command"
              }
              onChange={(e) => {
                setValue(e.target.value);
                setPickerIndex(0);
                grow();
              }}
              onKeyDown={(e) => {
                if (showPicker) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setPickerIndex((i) => (i + 1) % matched.length);
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setPickerIndex(
                      (i) => (i - 1 + matched.length) % matched.length,
                    );
                    return;
                  }
                  if (e.key === "Tab") {
                    e.preventDefault();
                    const cmd = matched[pickerIndex % matched.length];
                    if (cmd) selectCommand(cmd);
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setValue("");
                    setPickerIndex(0);
                    return;
                  }
                  // Enter while the picker shows a single exact-name match and
                  // the user has typed a full command name → run it (submit).
                  // Otherwise Enter accepts the highlighted suggestion.
                  if (e.key === "Enter" && !e.shiftKey) {
                    const exact = matched.find((c) => c.name === slashFilter);
                    if (!exact) {
                      e.preventDefault();
                      const cmd = matched[pickerIndex % matched.length];
                      if (cmd) selectCommand(cmd);
                      return;
                    }
                    // exact match → fall through to submit below
                  }
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              // Keep 16px on mobile so iOS doesn't zoom on focus; 13.5px on desktop.
              className="max-h-[200px] flex-1 resize-none bg-transparent font-mono text-[16px] text-marble outline-none placeholder:text-mutedlo disabled:opacity-50 md:text-[13.5px]"
            />
          </div>

          {/* Row 2 — toolbar */}
          <div className="flex items-center gap-1">
            <button type="button" className={iconBtn} aria-label="Attach document">
              <Plus size={15} />
            </button>

            <div className="flex-1" />

            {gatewayProfile ? (
              /* Gateway: the model switcher IS the picker — it swaps the
                 (default) profile's underlying LLM. No separate profile chip. */
              <ComposerModelSwitch profile={gatewayProfile} />
            ) : (
              /* Direct providers: pick from the curated model list. */
              <div className="flex items-center bg-panel px-2.5 py-1">
                <Select
                  value={model}
                  onChange={onModelChange}
                  options={models.map((m) => ({ value: m, label: m }))}
                  disabled={models.length === 0}
                  valueClassName="text-gold"
                />
              </div>
            )}

            {streaming ? (
              <button
                type="button"
                onClick={onStop}
                className="flex h-[30px] w-[30px] items-center justify-center text-parch transition-colors hover:text-carnelian"
                aria-label="Stop"
              >
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button type="button" className={iconBtn} aria-label="Dictate">
                <Mic size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

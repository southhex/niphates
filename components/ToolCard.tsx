"use client";

import { useState } from "react";
import {
  ChevronRight,
  Wrench,
  Check,
  X,
  FileText,
  Terminal,
  Search,
} from "lucide-react";
import type { ToolEvent } from "@/lib/types";
import { Spinner } from "./Spinner";
import { CopyButton } from "./CopyButton";

// File-edit tools where the preview is typically a file path
const FILE_TOOLS = new Set(["write_file", "patch", "read_file", "search_files"]);
const TERMINAL_TOOLS = new Set(["terminal", "execute_code"]);
const SEARCH_TOOLS = new Set(["web_search", "web_extract"]);

function detectIcon(tool: string) {
  if (FILE_TOOLS.has(tool)) return FileText;
  if (TERMINAL_TOOLS.has(tool)) return Terminal;
  if (SEARCH_TOOLS.has(tool)) return Search;
  return Wrench;
}

function toolLabel(tool: string): string {
  const labels: Record<string, string> = {
    write_file: "Write",
    patch: "Patch",
    read_file: "Read",
    search_files: "Search",
    terminal: "Terminal",
    execute_code: "Execute",
    web_search: "Web Search",
    web_extract: "Extract",
    browser_navigate: "Browse",
    browser_click: "Click",
    browser_type: "Type",
    image_generate: "Image",
    text_to_speech: "Speech",
    delegate_task: "Delegate",
    skill_view: "Skill",
    skill_manage: "Skill",
    todo: "Todo",
    cronjob: "Cron",
  };
  return labels[tool] || tool;
}

/**
 * One row per tool invocation. Shows the tool name, a one-line preview, and a
 * status glyph (spinner / check / X). When the tool has a preview, the row is
 * clickable and expands a full-width code-styled preview with its own copy
 * button. The `streaming` prop is reserved for callers that want to show a
 * live indicator on a still-running tool — today nothing visual depends on it
 * since `status === "started"` already shows a spinner.
 */
export function ToolCard({
  event,
  streaming: _streaming = false,
}: {
  event: ToolEvent;
  streaming?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const running = event.status === "started";
  const Icon = detectIcon(event.tool);

  const statusIcon = running ? (
    <Spinner className="text-[12px]" />
  ) : event.error ? (
    <X size={13} className="text-carnelian" />
  ) : (
    <Check size={13} className="text-malach" />
  );

  return (
    <div className="group/tool border border-hair bg-panel">
      <button
        type="button"
        onClick={() => (event.preview ? setOpen(!open) : undefined)}
        className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left ${
          event.preview
            ? "cursor-pointer hover:bg-panel2"
            : "cursor-default"
        }`}
      >
        {event.preview ? (
          <ChevronRight
            size={11}
            className={`shrink-0 text-mutedlo transition-transform ${
              open ? "rotate-90" : ""
            }`}
          />
        ) : (
          <span className="w-[11px] shrink-0" />
        )}
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-gold">
          {running ? statusIcon : <Icon size={12} className="text-mutedlo" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-mono text-[12px] text-marble">
            <span className="shrink-0">{toolLabel(event.tool)}</span>
            {event.preview && !open && (
              <span className="truncate text-[11px] text-mutedlo">
                {event.preview}
              </span>
            )}
            {!running && (
              <span className="flex shrink-0 items-center gap-1 text-mutedlo">
                {statusIcon}
                {event.durationMs != null && (
                  <span className="text-[10.5px]">
                    {event.durationMs < 1000
                      ? `${event.durationMs}ms`
                      : `${(event.durationMs / 1000).toFixed(2)}s`}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
      </button>
      {open && event.preview && (
        <div className="relative border-t border-hair px-2.5 py-2">
          <div className="absolute right-2 top-1.5">
            <CopyButton text={event.preview} />
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] text-parch pr-16">
            {event.preview}
          </pre>
        </div>
      )}
    </div>
  );
}

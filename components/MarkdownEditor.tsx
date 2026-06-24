// components/MarkdownEditor.tsx
// CodeMirror 6 markdown editor with live preview rendering (Obsidian-style).
// Markdown markers are hidden; formatting is applied inline as you type.
// Designed as a writing surface, not a code editor.
"use client";

import { useEffect, useRef } from "react";
import { EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  keymap,
  type Command,
  highlightSpecialChars,
  drawSelection,
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { defaultKeymap, history } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  indentOnInput,
} from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function stripFrontmatter(text: string): {
  body: string;
  frontmatter: string | null;
} {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (match) {
    return {
      body: text.replace(/^---\n[\s\S]*?\n---\n?/, ""),
      frontmatter: match[1],
    };
  }
  return { body: text, frontmatter: null };
}

function attachFrontmatter(body: string, frontmatter: string | null): string {
  if (!frontmatter) return body;
  return `---\n${frontmatter}\n---\n${body}`;
}

// ── Live Preview Decorations ──────────────────────────────────────────────

const headingDeco = Decoration.mark({ class: "cm-live-heading" });
const boldDeco = Decoration.mark({ class: "cm-live-bold" });
const italicDeco = Decoration.mark({ class: "cm-live-italic" });
const strikethroughDeco = Decoration.mark({ class: "cm-live-strikethrough" });
const linkDeco = Decoration.mark({ class: "cm-live-link" });
const codeDeco = Decoration.mark({ class: "cm-live-code" });
const quoteDeco = Decoration.mark({ class: "cm-live-quote" });
const listDeco = Decoration.mark({ class: "cm-live-list" });
const hrDeco = Decoration.mark({ class: "cm-live-hr" });
const markerHide = Decoration.mark({ class: "cm-marker-hidden" });

const RE_BOLD = /\*\*(.+?)\*\*/g;
const RE_ITALIC = /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g;
const RE_STRIKETHROUGH = /~~(.+?)~~/g;
const RE_LINK = /\[([^\]]+)\]\(([^)]+)\)/g;
const RE_CODE = /`([^`]+)`/g;
const RE_LIST_MARKER = /^(\s*)([-*+]|\d+\.)\s+/;
const RE_HR = /^(\s*)(---|\*\*\*|___)\s*$/;
const RE_QUOTE = /^>\s?/;

function buildLineDecorations(
  lineText: string,
  lineOffset: number,
): Array<{ from: number; to: number; deco: Decoration }> {
  const decos: Array<{ from: number; to: number; deco: Decoration }> = [];

  if (RE_HR.test(lineText)) {
    decos.push({ from: lineOffset, to: lineOffset + lineText.length, deco: hrDeco });
    const m = lineText.match(/^(\s*)(---|\*\*\*|___)\s*$/);
    if (m) {
      decos.push({
        from: lineOffset + (m[1]?.length ?? 0),
        to: lineOffset + (m[1]?.length ?? 0) + m[2].length,
        deco: markerHide,
      });
    }
    return decos;
  }

  if (RE_QUOTE.test(lineText)) {
    decos.push({ from: lineOffset, to: lineOffset + lineText.length, deco: quoteDeco });
    const m = lineText.match(/^>\s?/);
    if (m) {
      decos.push({ from: lineOffset, to: lineOffset + m[0].length, deco: markerHide });
    }
    return decos;
  }

  const listMatch = lineText.match(RE_LIST_MARKER);
  if (listMatch) {
    decos.push({ from: lineOffset, to: lineOffset + lineText.length, deco: listDeco });
    const markerEnd = (listMatch[1]?.length ?? 0) + (listMatch[2]?.length ?? 0);
    decos.push({
      from: lineOffset + (listMatch[1]?.length ?? 0),
      to: lineOffset + markerEnd,
      deco: markerHide,
    });
    applyInlineDecorations(lineText.substring(markerEnd), lineOffset + markerEnd, decos);
    return decos;
  }

  applyInlineDecorations(lineText, lineOffset, decos);
  return decos;
}

function applyInlineDecorations(
  text: string,
  offset: number,
  decos: Array<{ from: number; to: number; deco: Decoration }>,
) {
  const codeRanges: Array<[number, number]> = [];
  let m: RegExpExecArray | null;
  RE_CODE.lastIndex = 0;
  while ((m = RE_CODE.exec(text)) !== null) {
    const start = offset + m.index + 1;
    const end = start + m[1].length;
    decos.push({ from: start, to: end, deco: codeDeco });
    codeRanges.push([m.index, m.index + m[0].length]);
    decos.push({ from: offset + m.index, to: offset + m.index + 1, deco: markerHide });
    decos.push({ from: offset + m.index + m[0].length - 1, to: offset + m.index + m[0].length, deco: markerHide });
  }

  const inCodeRange = (pos: number, len: number) =>
    codeRanges.some(([cs, ce]) => pos >= cs && pos + len <= ce);

  RE_BOLD.lastIndex = 0;
  while ((m = RE_BOLD.exec(text)) !== null) {
    if (inCodeRange(m.index, m[0].length)) continue;
    const contentStart = offset + m.index + 2;
    const contentEnd = contentStart + m[1].length;
    if (contentEnd > contentStart) {
      decos.push({ from: contentStart, to: contentEnd, deco: boldDeco });
      decos.push({ from: offset + m.index, to: contentStart, deco: markerHide });
      decos.push({ from: contentEnd, to: contentEnd + 2, deco: markerHide });
    }
  }

  RE_ITALIC.lastIndex = 0;
  while ((m = RE_ITALIC.exec(text)) !== null) {
    if (inCodeRange(m.index, m[0].length)) continue;
    const contentStart = offset + m.index + 1;
    const contentEnd = contentStart + m[1].length;
    if (contentEnd > contentStart) {
      decos.push({ from: contentStart, to: contentEnd, deco: italicDeco });
      decos.push({ from: offset + m.index, to: contentStart, deco: markerHide });
      decos.push({ from: contentEnd, to: contentEnd + 1, deco: markerHide });
    }
  }

  RE_STRIKETHROUGH.lastIndex = 0;
  while ((m = RE_STRIKETHROUGH.exec(text)) !== null) {
    if (inCodeRange(m.index, m[0].length)) continue;
    const contentStart = offset + m.index + 2;
    const contentEnd = contentStart + m[1].length;
    if (contentEnd > contentStart) {
      decos.push({ from: contentStart, to: contentEnd, deco: strikethroughDeco });
      decos.push({ from: offset + m.index, to: contentStart, deco: markerHide });
      decos.push({ from: contentEnd, to: contentEnd + 2, deco: markerHide });
    }
  }

  RE_LINK.lastIndex = 0;
  while ((m = RE_LINK.exec(text)) !== null) {
    if (inCodeRange(m.index, m[0].length)) continue;
    const textStart = offset + m.index + 1;
    const textEnd = textStart + m[1].length;
    if (textEnd > textStart) {
      decos.push({ from: textStart, to: textEnd, deco: linkDeco });
      decos.push({ from: offset + m.index, to: textStart, deco: markerHide });
      decos.push({ from: textEnd, to: offset + m.index + m[0].length, deco: markerHide });
    }
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const doc = view.state.doc;
  const decos: Array<{ from: number; to: number; deco: Decoration }> = [];

  for (let line = 1; line <= doc.lines; line++) {
    const lineObj = doc.line(line);
    const lineText = lineObj.text;

    const headingMatch = lineText.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const contentStart = lineObj.from + headingMatch[1].length + 1;
      const contentEnd = contentStart + headingMatch[2].length;
      // Only add heading decoration if there's actual content
      if (contentEnd > contentStart) {
        decos.push({
          from: contentStart,
          to: contentEnd,
          deco: Decoration.mark({ class: `cm-live-heading cm-h${level}` }),
        });
      }
      // Hide # markers
      const markerEnd = lineObj.from + headingMatch[1].length + 1;
      if (markerEnd > lineObj.from) {
        decos.push({
          from: lineObj.from,
          to: markerEnd,
          deco: markerHide,
        });
      }
      continue;
    }

    const lineDecos = buildLineDecorations(lineText, lineObj.from);
    decos.push(...lineDecos);
  }

  // Filter out any zero-width decorations (CodeMirror rejects them)
  return Decoration.set(
    decos
      .filter((d) => d.to > d.from)
      .map((d) => d.deco.range(d.from, d.to)),
    true,
  );
}

// ── Formatting Commands ───────────────────────────────────────────────────
// Wrap the current selection (or insert at cursor) with markdown syntax.

const toggleWrapping = (prefix: string, suffix: string): Command => {
  return (view) => {
    const { state } = view;
    const { from, to, empty } = state.selection.main;
    if (empty) {
      // Nothing selected — insert markers and place cursor between them
      const insert = `${prefix}_${suffix}`;
      view.dispatch({
        changes: { from, insert },
        selection: { anchor: from + prefix.length + 1 },
      });
    } else {
      // Wrap selection
      const text = state.doc.sliceString(from, to);
      const endPos = from + prefix.length + text.length + suffix.length;
      view.dispatch({
        changes: { from, to, insert: `${prefix}${text}${suffix}` },
        selection: { anchor: endPos },
      });
    }
    return true;
  };
};

const toggleOrderedList: Command = (view) => {
  const { state } = view;
  const { from, empty } = state.selection.main;
  if (empty) {
    view.dispatch({
      changes: { from, insert: "1. " },
      selection: { anchor: from + 3 },
    });
  } else {
    const { to } = state.selection.main;
    const text = state.doc.sliceString(from, to);
    const endPos = to + 3;
    view.dispatch({
      changes: { from, to, insert: `1. ${text}` },
      selection: { anchor: endPos },
    });
  }
  return true;
};

const formattingKeymap = keymap.of([
  {
    key: "Mod-b",
    run: toggleWrapping("**", "**"),
  },
  {
    key: "Mod-i",
    run: toggleWrapping("*", "*"),
  },
  {
    key: "Mod-k",
    run: toggleWrapping("[", "](url)"),
  },
  {
    key: "Mod-`",
    run: wrapCodeCommand,
  },
  {
    key: "Mod-Shift-s",
    run: toggleWrapping("~~", "~~"),
  },
  {
    key: "Mod-Shift-.",
    run: toggleWrapping("> ", ""),
  },
  {
    key: "Mod-Shift-1",
    run: toggleHeading("#"),
  },
  {
    key: "Mod-Shift-2",
    run: toggleHeading("##"),
  },
  {
    key: "Mod-Shift-3",
    run: toggleHeading("###"),
  },
  {
    key: "Mod-l",
    run: toggleWrapping("- ", ""),
  },
  {
    key: "Mod-o",
    run: toggleOrderedList,
  },
]);

function toggleHeading(level: string): Command {
  return (view) => {
    const { state } = view;
    const { from, empty } = state.selection.main;
    if (empty) {
      const insert = `${level} `;
      const cursorPos = from + insert.length;
      view.dispatch({
        changes: { from, insert },
        selection: { anchor: cursorPos },
      });
    } else {
      const { to } = state.selection.main;
      const text = state.doc.sliceString(from, to);
      const endPos = from + level.length + 1 + text.length;
      view.dispatch({
        changes: { from, to, insert: `${level} ${text}` },
        selection: { anchor: endPos },
      });
    }
    return true;
  };
}

function wrapCodeCommand(view: EditorView): boolean {
  const { state } = view;
  const { from, to, empty } = state.selection.main;
  if (empty) {
    const insert = "``";
    view.dispatch({
      changes: { from, insert },
      selection: { anchor: from + 1 },
    });
  } else {
    const text = state.doc.sliceString(from, to);
    if (text.includes("\n")) {
      const endPos = from + 4 + text.length + 4;
      view.dispatch({
        changes: { from, to, insert: `\`\`\`\n${text}\n\`\`\`` },
        selection: { anchor: endPos },
      });
    } else {
      const endPos = from + text.length + 2;
      view.dispatch({
        changes: { from, to, insert: `\`${text}\`` },
        selection: { anchor: endPos },
      });
    }
  }
  return true;
}

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      this.decorations = buildDecorations(update.view);
    }
  },
  { decorations: (v) => v.decorations },
);

// ── Writing Surface Theme ─────────────────────────────────────────────────
// No line numbers, no gutters, no active line highlight.
// Generous padding, serif font, muted cursor — feels like a page.

const writingTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--panel)",
    color: "var(--parch)",
    fontSize: "16px",
    lineHeight: "1.85",
    height: "100%",
  },
  ".cm-content": {
    caretColor: "var(--gold)",
    padding: "2rem 0 4rem",
    fontFamily: "var(--font-spectral), Georgia, serif",
    maxWidth: "680px",
    margin: "0 auto",
    paddingLeft: "calc(50% - 340px)",
    paddingRight: "calc(50% - 340px)",
  },
  ".cm-cursor": {
    borderLeft: "1px solid var(--gold)",
  },
  ".cm-placeholder": {
    color: "var(--mutedlo)",
    fontStyle: "italic",
  },
  ".cm-selectionBackground": {
    backgroundColor: "rgba(201, 162, 75, 0.15) !important",
  },
  // Hide markdown markers
  ".cm-marker-hidden": {
    color: "transparent",
    fontSize: "0",
    width: "0",
    overflow: "hidden",
    display: "inline-block",
    pointerEvents: "none",
  },
  // Live heading styles
  ".cm-live-heading": {
    color: "var(--gold)",
    fontWeight: 600,
    fontFamily: "var(--font-cinzel), serif",
    letterSpacing: "0.02em",
  },
  ".cm-h1": { fontSize: "2em", lineHeight: "1.3" },
  ".cm-h2": { fontSize: "1.6em", lineHeight: "1.35" },
  ".cm-h3": { fontSize: "1.35em", lineHeight: "1.4" },
  ".cm-h4": { fontSize: "1.15em", lineHeight: "1.45" },
  // Live bold
  ".cm-live-bold": {
    color: "var(--marble)",
    fontWeight: 700,
  },
  // Live italic
  ".cm-live-italic": {
    color: "var(--marble)",
    fontStyle: "italic",
  },
  // Live strikethrough
  ".cm-live-strikethrough": {
    textDecoration: "line-through",
    color: "var(--muted)",
  },
  // Live link
  ".cm-live-link": {
    color: "var(--gold)",
    textDecoration: "underline",
    textDecorationColor: "var(--goldbri)",
    textUnderlineOffset: "2px",
  },
  // Live code
  ".cm-live-code": {
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    borderRadius: "3px",
    padding: "0.1em 0.35em",
    fontFamily: "var(--font-mono), monospace",
    fontSize: "0.88em",
    color: "var(--goldbri)",
    border: "1px solid var(--hair)",
  },
  // Live quote
  ".cm-live-quote": {
    color: "var(--muted)",
    borderLeft: "2px solid var(--gold)",
    paddingLeft: "0.75em",
    marginLeft: "0",
    display: "block",
    fontStyle: "italic",
  },
  // Live list
  ".cm-live-list": {
    color: "var(--parch)",
  },
  // Live horizontal rule
  ".cm-live-hr": {
    color: "transparent",
    borderTop: "1px solid var(--hair)",
    display: "block",
    height: "0",
    overflow: "hidden",
    margin: "1.5em 0",
  },
});

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
}: MarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const frontmatterRef = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const { body, frontmatter } = stripFrontmatter(value);
    frontmatterRef.current = frontmatter;

    const extensions = [
      highlightSpecialChars(),
      history(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      markdown(),
      livePreviewPlugin,
      writingTheme,
      oneDark,
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const body = update.state.doc.toString();
          const full = attachFrontmatter(body, frontmatterRef.current);
          onChangeRef.current(full);
        }
      }),
      formattingKeymap,
      keymap.of([...defaultKeymap, ...searchKeymap]),
    ];

    if (placeholder) {
      extensions.push(
        EditorView.contentAttributes.of({ "aria-placeholder": placeholder }),
      );
    }

    const state = EditorState.create({ doc: body, extensions });
    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const { body } = stripFrontmatter(value);
    const currentBody = view.state.doc.toString();
    if (currentBody !== body) {
      view.dispatch({
        changes: { from: 0, to: currentBody.length, insert: body },
      });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto bg-panel"
      spellCheck
    />
  );
}

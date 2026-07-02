// components/MarkdownEditor.tsx
// CodeMirror 6 markdown editor with Obsidian-style live preview.
//
// Live preview is driven off the Lezer markdown syntax tree (not regex): for
// each formatting node in the visible viewport we (a) style the content and
// (b) HIDE the syntax markers — UNLESS the cursor is on that line, in which
// case the markers are revealed so they can be edited. Markers are hidden with
// a zero-width replace decoration (not CSS), so cursor mapping stays correct.
//
// Designed as a writing surface, not a code editor: no line numbers, no
// gutters, serif body font, parchment palette. We deliberately do NOT load
// oneDark or syntaxHighlighting — those are code-editor themes that would
// fight this surface and the live-preview decorations.
"use client";

import { useEffect, useRef } from "react";
import {
  EditorState,
  Prec,
  RangeSetBuilder,
  StateField,
  StateEffect,
} from "@codemirror/state";
import {
  EditorView,
  keymap,
  type Command,
  drawSelection,
  Decoration,
  type DecorationSet,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { indentOnInput, syntaxTree } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /**
   * Inline document title rendered at the top of the editing column, as if it
   * were the entry's H1. Display-only — never part of the editable document or
   * the saved file. Derived (e.g. from the filename) by the caller.
   */
  title?: string;
}

// ── Frontmatter handling ──────────────────────────────────────────────────
// YAML frontmatter is stripped from the editing surface but preserved across
// saves. The body the editor sees never includes it.

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;

function stripFrontmatter(text: string): {
  body: string;
  frontmatter: string | null;
} {
  const match = text.match(FRONTMATTER_RE);
  if (match) {
    return { body: text.slice(match[0].length), frontmatter: match[1] };
  }
  return { body: text, frontmatter: null };
}

function attachFrontmatter(body: string, frontmatter: string | null): string {
  if (frontmatter === null) return body;
  return `---\n${frontmatter}\n---\n${body}`;
}

// ── Live preview decorations ──────────────────────────────────────────────

// Zero-width replacement that fully removes a marker range from layout, so the
// caret can't land "inside" a hidden marker (the bug CSS-hiding caused).
const hiddenMarker = Decoration.replace({});

// A horizontal rule rendered as an actual line, replacing the `---` text.
class HRWidget extends WidgetType {
  toDOM() {
    const hr = document.createElement("span");
    hr.className = "cm-live-hr-line";
    return hr;
  }
  ignoreEvent() {
    return false;
  }
}

// A real bullet glyph replacing the `-`/`*`/`+` list marker.
class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const b = document.createElement("span");
    b.className = "cm-live-bullet";
    b.textContent = "•";
    return b;
  }
  ignoreEvent() {
    return false;
  }
}

// ── Inline title (block widget at top of document) ────────────────────────
// A non-editable block widget pinned at doc position 0, rendered inside the
// editing column so it scrolls with the content and aligns to the same
// margins — reading as the entry's H1 without being part of the document.

class TitleWidget extends WidgetType {
  constructor(readonly title: string) {
    super();
  }
  eq(other: TitleWidget) {
    return other.title === this.title;
  }
  toDOM() {
    const el = document.createElement("div");
    el.className = "cm-inline-title";
    el.textContent = this.title;
    return el;
  }
  ignoreEvent() {
    return true;
  }
}

const setTitleEffect = StateEffect.define<string>();

// Holds the title block decoration. Rebuilt only when the title changes.
const titleField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    for (const e of tr.effects) {
      if (e.is(setTitleEffect)) {
        if (!e.value) return Decoration.none;
        return Decoration.set([
          Decoration.widget({
            widget: new TitleWidget(e.value),
            side: -1,
            block: true,
          }).range(0),
        ]);
      }
    }
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

// Lezer markdown node names → the class applied to their *content*, plus the
// child node name whose ranges are the markers to hide.
const INLINE_STYLES: Record<string, { content: string; mark: string }> = {
  StrongEmphasis: { content: "cm-live-bold", mark: "EmphasisMark" },
  Emphasis: { content: "cm-live-italic", mark: "EmphasisMark" },
  Strikethrough: { content: "cm-live-strikethrough", mark: "StrikethroughMark" },
  InlineCode: { content: "cm-live-code", mark: "CodeMark" },
};

const HEADING_CLASS: Record<string, string> = {
  ATXHeading1: "cm-live-heading cm-h1",
  ATXHeading2: "cm-live-heading cm-h2",
  ATXHeading3: "cm-live-heading cm-h3",
  ATXHeading4: "cm-live-heading cm-h4",
  ATXHeading5: "cm-live-heading cm-h5",
  ATXHeading6: "cm-live-heading cm-h6",
};

interface PendingDeco {
  from: number;
  to: number;
  deco: Decoration;
  /**
   * Whether this decoration should also be registered as an atomic range.
   * Inline formatting markers (emphasis `**`, code `` ` ``, link brackets)
   * are atomic so arrow keys / clicks jump cleanly over them. Block-level
   * markers (`> `, `# `, bullets) are NOT atomic — the user expects to
   * backspace through them one character at a time, and an atomic range
   * would make a single Backspace eat the entire marker (which looks like
   * "the whole line was deleted" when the marker carries the line's
   * visual identity, e.g. the quote's gold border).
   */
  atomic: boolean;
}

function buildDecorations(view: EditorView): {
  decorations: DecorationSet;
  atomic: DecorationSet;
} {
  const { state } = view;
  const tree = syntaxTree(state);
  const pending: PendingDeco[] = [];

  // A formatting span is "revealed" — its markers shown so they can be edited —
  // only when a selection/cursor actually touches that span (inclusive of its
  // edges, so the caret sitting just after a closing marker still reveals it).
  // This is span-scoped, NOT line-scoped: other formatting on the same line
  // stays collapsed.
  const revealedIn = (from: number, to: number) =>
    state.selection.ranges.some((r) => r.from <= to && r.to >= from);

  // Hide a marker range. `spanFrom`/`spanTo` bound the formatting construct the
  // marker belongs to; if the cursor is inside that span, keep the marker shown.
  // `atomic` controls whether the hidden range is also an atomic range (see
  // PendingDeco.atomic).
  const hide = (
    from: number,
    to: number,
    spanFrom = from,
    spanTo = to,
    atomic = true,
  ) => {
    if (to <= from) return;
    if (revealedIn(spanFrom, spanTo)) return;
    pending.push({ from, to, deco: hiddenMarker, atomic });
  };
  const mark = (from: number, to: number, cls: string) => {
    if (to <= from) return;
    pending.push({ from, to, deco: Decoration.mark({ class: cls }), atomic: false });
  };

  // Walk only the visible viewport ranges — not the whole document.
  for (const { from: vFrom, to: vTo } of view.visibleRanges) {
    tree.iterate({
      from: vFrom,
      to: vTo,
      enter: (node) => {
        const name = node.name;

        // Headings: style content after the `#…` + space, hide the marker.
        const headingClass = HEADING_CLASS[name];
        if (headingClass) {
          const line = state.doc.lineAt(node.from);
          const m = line.text.match(/^(#{1,6})(\s+)/);
          if (m) {
            const markerEnd = line.from + m[0].length;
            // Heading marker reveals when the cursor is anywhere on the line.
            // NOT atomic — user expects to backspace through `#` one char
            // at a time, not eat the whole marker in one keystroke.
            hide(line.from, markerEnd, line.from, line.to, false);
            mark(markerEnd, line.to, headingClass);
          } else {
            mark(node.from, node.to, headingClass);
          }
          return;
        }

        // Inline emphasis / code: style content, hide the marker children.
        const inline = INLINE_STYLES[name];
        if (inline) {
          mark(node.from, node.to, inline.content);
          const child = node.node.firstChild;
          let c = child;
          while (c) {
            // Reveal the markers only when the cursor is inside THIS span.
            if (c.name === inline.mark) hide(c.from, c.to, node.from, node.to);
            c = c.nextSibling;
          }
          return;
        }

        // Links: [text](url) → show text, hide brackets + url.
        if (name === "Link") {
          const inner = node.node;
          const urlNode = inner.getChild("URL");
          // Markers: '[', ']', '(', ')' + LinkMark nodes. Hide everything that
          // isn't the link text, style the text.
          let c = inner.firstChild;
          let textFrom = -1;
          let textTo = -1;
          while (c) {
            // Reveal brackets/url only when the cursor is inside this link.
            if (c.name === "LinkMark") {
              hide(c.from, c.to, node.from, node.to);
            } else if (c.name === "URL") {
              hide(c.from, c.to, node.from, node.to);
            }
            c = c.nextSibling;
          }
          // Link text is between the first '[' and ']'. Derive from node bounds.
          const open = inner.firstChild; // '['
          if (open && open.name === "LinkMark") {
            textFrom = open.to;
            // find the ']' (LinkMark that precedes the '(')
            let cc = open.nextSibling;
            while (cc && cc.name !== "LinkMark") cc = cc.nextSibling;
            if (cc) textTo = cc.from;
          }
          if (urlNode) hide(urlNode.from, urlNode.to, node.from, node.to);
          if (textFrom >= 0 && textTo > textFrom) {
            mark(textFrom, textTo, "cm-live-link");
          }
          return;
        }

        // Blockquote marker `> ` → style the line, hide the marker.
        if (name === "QuoteMark") {
          const line = state.doc.lineAt(node.from);
          // hide the '>' plus a single trailing space if present
          let to = node.to;
          if (state.doc.sliceString(to, to + 1) === " ") to += 1;
          // Quote marker reveals when the cursor is anywhere on the line.
          // NOT atomic — Backspace at the start of `> hello` should delete
          // one character (the space), not the whole `> ` marker in one go.
          hide(node.from, to, line.from, line.to, false);
          // Use a LINE decoration (not a mark) so the class lands on the
          // .cm-line block element. This makes the borderLeft span the
          // full line height, and consecutive quote lines' borders touch
          // to form one continuous gold bar — no seam at line breaks.
          pending.push({
            from: line.from,
            to: line.from,
            deco: Decoration.line({ class: "cm-live-quote" }),
            atomic: false,
          });
          return;
        }

        // Horizontal rule → replace the whole line with a drawn rule.
        if (name === "HorizontalRule") {
          const hrLine = state.doc.lineAt(node.from);
          if (!revealedIn(hrLine.from, hrLine.to)) {
            pending.push({
              from: node.from,
              to: node.to,
              deco: Decoration.replace({ widget: new HRWidget() }),
              atomic: false,
            });
          } else {
            mark(node.from, node.to, "cm-live-hr-text");
          }
          return;
        }

        // List markers. Unordered (`-`/`*`/`+`) render as a real • bullet;
        // ordered (`1.`) keep their number, just tinted. The raw marker reveals
        // when the cursor is on that list line so it can be edited.
        if (name === "ListMark") {
          const markerText = state.doc.sliceString(node.from, node.to);
          const isUnordered = /^[-*+]$/.test(markerText);
          const listLine = state.doc.lineAt(node.from);
          if (isUnordered && !revealedIn(listLine.from, listLine.to)) {
            pending.push({
              from: node.from,
              to: node.to,
              deco: Decoration.replace({ widget: new BulletWidget() }),
              atomic: false,
            });
          } else {
            mark(node.from, node.to, "cm-live-listmark");
          }
          return;
        }
      },
    });
  }

  // CodeMirror requires decorations sorted by (from, startSide). Replace
  // decorations (hidden markers, widgets) must sort before mark decorations at
  // the same position, which `startSide` encodes — sort on it explicitly.
  pending.sort(
    (a, b) => a.from - b.from || a.deco.startSide - b.deco.startSide,
  );

  const builder = new RangeSetBuilder<Decoration>();
  const atomicBuilder = new RangeSetBuilder<Decoration>();
  for (const p of pending) {
    builder.add(p.from, p.to, p.deco);
    if (p.atomic) atomicBuilder.add(p.from, p.to, p.deco);
  }
  return { decorations: builder.finish(), atomic: atomicBuilder.finish() };
}

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    atomic: DecorationSet;
    constructor(view: EditorView) {
      const built = buildDecorations(view);
      this.decorations = built.decorations;
      this.atomic = built.atomic;
    }
    update(update: ViewUpdate) {
      // Rebuild only when the doc, viewport, or selection actually changed —
      // selection matters because it drives marker reveal on the active line.
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet
      ) {
        const built = buildDecorations(update.view);
        this.decorations = built.decorations;
        this.atomic = built.atomic;
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    // Atomic ranges: arrow-key/click across a hidden INLINE marker (emphasis,
    // code, link brackets) jumps over it cleanly instead of stranding the
    // caret in a zero-width gap. Block-level markers (`> `, `# `, bullets)
    // are deliberately NOT atomic — see PendingDeco.atomic for why.
    provide: (plugin) =>
      EditorView.atomicRanges.of(
        (view) => view.plugin(plugin)?.atomic ?? Decoration.none,
      ),
  },
);

// ── Formatting commands ───────────────────────────────────────────────────

const toggleWrapping = (prefix: string, suffix: string): Command => {
  return (view) => {
    const { state } = view;
    const { from, to, empty } = state.selection.main;

    if (empty) {
      // Obsidian-style "jump out": if the closing marker is immediately to the
      // right of the cursor, a second press of the shortcut steps past it
      // instead of inserting another pair — matching word-processor muscle
      // memory (Ctrl-B to start bold, Ctrl-B again to end it).
      const after = state.doc.sliceString(from, from + suffix.length);
      if (after === suffix) {
        view.dispatch({ selection: { anchor: from + suffix.length } });
        return true;
      }
      const insert = `${prefix}${suffix}`;
      view.dispatch({
        changes: { from, insert },
        selection: { anchor: from + prefix.length },
      });
      return true;
    }

    // A selection that's already wrapped in these markers → unwrap (toggle off).
    const before = state.doc.sliceString(from - prefix.length, from);
    const trailing = state.doc.sliceString(to, to + suffix.length);
    if (before === prefix && trailing === suffix) {
      // Delete the two marker runs; positions after the first deletion shift
      // left by prefix.length, so the selection lands on the now-bare text.
      view.dispatch({
        changes: [
          { from: from - prefix.length, to: from, insert: "" },
          { from: to, to: to + suffix.length, insert: "" },
        ],
        selection: { anchor: from - prefix.length, head: to - prefix.length },
      });
      return true;
    }

    const text = state.doc.sliceString(from, to);
    view.dispatch({
      changes: { from, to, insert: `${prefix}${text}${suffix}` },
      selection: {
        anchor: from + prefix.length,
        head: from + prefix.length + text.length,
      },
    });
    return true;
  };
};

// Prefix the start of every selected line (headings, quotes, lists).
const toggleLinePrefix = (prefix: string): Command => {
  return (view) => {
    const { state } = view;
    const { from, to } = state.selection.main;
    const firstLine = state.doc.lineAt(from).number;
    const lastLine = state.doc.lineAt(to).number;
    const changes = [];
    for (let n = firstLine; n <= lastLine; n++) {
      const line = state.doc.line(n);
      changes.push({ from: line.from, insert: prefix });
    }
    view.dispatch({
      changes,
      selection: { anchor: from + prefix.length },
      scrollIntoView: true,
    });
    return true;
  };
};

const toggleOrderedList: Command = (view) => {
  const { state } = view;
  const { from, to } = state.selection.main;
  const firstLine = state.doc.lineAt(from).number;
  const lastLine = state.doc.lineAt(to).number;
  const changes = [];
  let i = 1;
  for (let n = firstLine; n <= lastLine; n++) {
    const line = state.doc.line(n);
    changes.push({ from: line.from, insert: `${i}. ` });
    i++;
  }
  view.dispatch({ changes, scrollIntoView: true });
  return true;
};

// ── Blockquote line continuation / exit ───────────────────────────────────
//
// Obsidian-style blockquote editing:
//   - Pressing Enter inside `> line` continues the quote on the next line.
//   - Pressing Enter inside an empty `> ` line exits the quote.
//   - Pressing Backspace on a non-empty quote line (e.g. `> hello`) just
//     deletes one character — the default Backspace handler does this and
//     we don't override it. A previous version of this override ate the
//     whole `> ` marker as soon as the cursor entered the leading marker
//     zone, which (with the `>` hidden by our live-preview replace) felt
//     like the entire line had been deleted.
//   - Pressing Backspace on an empty quote line (`> ` with no other
//     content) exits the quote in one keystroke — there's nothing to
//     "step back through" so a single delete makes sense.
//
// The decision logic is extracted into pure helpers so it can be unit
// tested without spinning up a CodeMirror instance.

// Match the parser's notion of a blockquote marker: `> ` (the `>` MUST be
// followed by at least one space). The existing QuoteMark decoration at the
// bottom of this file only fires when the parser emits a QuoteMark node, and
// the markdown grammar requires the space — so a bare `>` at the start of a
// line is just a literal `>`, not a quote. Matching the parser keeps our
// override consistent with the live preview.
const QUOTE_MARKER = /^> /;

/** Length of the leading `> ` marker on this line, or 0 if not a quote. */
export function quoteMarkerLength(lineText: string): number {
  const match = lineText.match(QUOTE_MARKER);
  return match ? match[0].length : 0;
}

/**
 * Plan what Enter should do on a line, given the line text. Returns `null`
 * to fall through to the default Enter handler (the line isn't a quote).
 */
export interface QuoteEnterPlan {
  /** Text to insert at the cursor. */
  insert: string;
}

export function planQuoteEnter(lineText: string): QuoteEnterPlan | null {
  if (!QUOTE_MARKER.test(lineText)) return null;
  // Empty quote line (`> `) → exit the quote: just a bare newline.
  // This matches Obsidian: pressing Enter on an empty quote drops you out.
  if (lineText.trim() === ">") {
    return { insert: "\n" };
  }
  // Non-empty quote line → continue the quote on the new line.
  const marker = lineText.match(QUOTE_MARKER)![0];
  return { insert: `\n${marker}` };
}

/**
 * Plan whether Backspace should do a one-keystroke quote-exit on this line.
 * Returns `true` only when the line is a quote with no other content —
 * i.e. the user is sitting on an empty quote and a single Backspace should
 * remove the marker and exit. For non-empty quote lines, return `false`
 * and let the default Backspace handler delete one character at a time
 * (matching Obsidian's `> hello` → Backspace → `>ello` → `>llo` sequence).
 *
 * Note: a line that contains just `>` (no trailing space) is NOT a quote
 * per the markdown grammar — we require `^> ` to match the parser — so
 * `planQuoteBackspace(">")` returns `false` even though its trim is `">"`.
 */
export function planQuoteBackspace(lineText: string): boolean {
  return QUOTE_MARKER.test(lineText) && lineText.trim() === ">";
}

const quoteEnterCommand: Command = (view) => {
  const { state } = view;
  const { head, empty } = state.selection.main;
  // Only handle a collapsed selection; multi-cursor / range Enter is rare
  // here and the default behavior is fine.
  if (!empty) return false;
  const line = state.doc.lineAt(head);
  const plan = planQuoteEnter(line.text);
  if (!plan) return false;
  view.dispatch({
    changes: { from: head, insert: plan.insert },
    selection: { anchor: head + plan.insert.length },
  });
  return true;
};

const quoteBackspaceCommand: Command = (view) => {
  const { state } = view;
  const { head, empty } = state.selection.main;
  if (!empty) return false;
  // If the cursor is at the start of the document, there is no marker to
  // delete and no previous line to merge with — fall through to default.
  if (head === 0) return false;
  const line = state.doc.lineAt(head);
  if (!planQuoteBackspace(line.text)) return false;
  const markerLen = quoteMarkerLength(line.text);
  if (markerLen === 0) return false;
  // Delete the whole `> ` marker in one stroke. The cursor lands at the
  // line's start position, which is now visually "the start of a normal
  // line" because the quote marker is gone.
  view.dispatch({
    changes: { from: line.from, to: line.from + markerLen },
    selection: { anchor: line.from },
  });
  return true;
};

// High precedence: take over Enter/Backspace when we're on a quote line, and
// fall through to the default keymap otherwise. Run BEFORE the formatting
// keymap so quote behavior isn't shadowed by other mods.
const quoteKeymap = Prec.high(
  keymap.of([
    { key: "Enter", run: quoteEnterCommand },
    { key: "Backspace", run: quoteBackspaceCommand },
  ]),
);

const wrapCode: Command = (view) => {
  const { state } = view;
  const { from, to, empty } = state.selection.main;
  if (empty) {
    // Jump out past a closing backtick (same Obsidian behavior as Mod-b/i).
    if (state.doc.sliceString(from, from + 1) === "`") {
      view.dispatch({ selection: { anchor: from + 1 } });
      return true;
    }
    view.dispatch({
      changes: { from, insert: "``" },
      selection: { anchor: from + 1 },
    });
    return true;
  }
  const text = state.doc.sliceString(from, to);
  if (text.includes("\n")) {
    view.dispatch({
      changes: { from, to, insert: `\`\`\`\n${text}\n\`\`\`` },
      selection: { anchor: from + 4, head: from + 4 + text.length },
    });
  } else {
    view.dispatch({
      changes: { from, to, insert: `\`${text}\`` },
      selection: { anchor: from + 1, head: from + 1 + text.length },
    });
  }
  return true;
};

const formattingKeymap = keymap.of([
  { key: "Mod-b", run: toggleWrapping("**", "**") },
  { key: "Mod-i", run: toggleWrapping("*", "*") },
  { key: "Mod-k", run: toggleWrapping("[", "](url)") },
  { key: "Mod-`", run: wrapCode },
  { key: "Mod-Shift-s", run: toggleWrapping("~~", "~~") },
  { key: "Mod-Shift-.", run: toggleLinePrefix("> ") },
  { key: "Mod-Shift-1", run: toggleLinePrefix("# ") },
  { key: "Mod-Shift-2", run: toggleLinePrefix("## ") },
  { key: "Mod-Shift-3", run: toggleLinePrefix("### ") },
  { key: "Mod-l", run: toggleLinePrefix("- ") },
  { key: "Mod-o", run: toggleOrderedList },
]);

// ── Writing surface theme ─────────────────────────────────────────────────

const writingTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "var(--panel)",
      color: "var(--parch)",
      fontSize: "16px",
      height: "100%",
    },
    ".cm-scroller": {
      fontFamily: "var(--font-spectral), Georgia, serif",
      lineHeight: "1.85",
      overflow: "auto",
    },
    ".cm-content": {
      caretColor: "var(--gold)",
      padding: "2rem 0 4rem",
      maxWidth: "680px",
      margin: "0 auto",
      paddingLeft: "calc(50% - 340px)",
      paddingRight: "calc(50% - 340px)",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeft: "1.5px solid var(--gold)",
    },
    ".cm-placeholder": {
      color: "var(--mutedlo)",
      fontStyle: "italic",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":
      {
        backgroundColor: "color-mix(in srgb, var(--gold) 18%, transparent)",
      },
    "&.cm-focused": { outline: "none" },

    // Inline document title (block widget at top — display only)
    ".cm-inline-title": {
      fontFamily: "var(--font-cinzel), serif",
      fontSize: "2.1em",
      lineHeight: "1.25",
      fontWeight: "600",
      color: "var(--gold)",
      letterSpacing: "0.01em",
      marginBottom: "1.25rem",
      paddingBottom: "0.6rem",
      borderBottom: "1px solid var(--hair)",
    },

    // Headings
    ".cm-live-heading": {
      color: "var(--gold)",
      fontWeight: "600",
      fontFamily: "var(--font-cinzel), serif",
      letterSpacing: "0.02em",
    },
    ".cm-h1": { fontSize: "2em", lineHeight: "1.3" },
    ".cm-h2": { fontSize: "1.6em", lineHeight: "1.35" },
    ".cm-h3": { fontSize: "1.35em", lineHeight: "1.4" },
    ".cm-h4": { fontSize: "1.15em", lineHeight: "1.45" },
    ".cm-h5": { fontSize: "1.05em" },
    ".cm-h6": { fontSize: "1em", color: "var(--muted)" },

    ".cm-live-bold": { color: "var(--marble)", fontWeight: "700" },
    ".cm-live-italic": { color: "var(--marble)", fontStyle: "italic" },
    ".cm-live-strikethrough": {
      textDecoration: "line-through",
      color: "var(--muted)",
    },
    ".cm-live-link": {
      color: "var(--gold)",
      textDecoration: "underline",
      textDecorationColor: "var(--goldbri)",
      textUnderlineOffset: "2px",
      cursor: "pointer",
    },
    ".cm-live-code": {
      backgroundColor: "color-mix(in srgb, var(--void) 45%, transparent)",
      borderRadius: "3px",
      padding: "0.1em 0.35em",
      fontFamily: "var(--font-mono), monospace",
      fontSize: "0.88em",
      color: "var(--goldbri)",
      border: "1px solid var(--hair)",
    },
    ".cm-live-quote": {
      color: "var(--muted)",
      fontStyle: "italic",
      borderLeft: "2px solid var(--gold)",
      paddingLeft: "0.75em",
    },
    ".cm-live-listmark": { color: "var(--gold)" },
    ".cm-live-bullet": {
      color: "var(--gold)",
      display: "inline-block",
      fontWeight: "700",
    },
    ".cm-live-hr-text": { color: "var(--mutedlo)" },
    ".cm-live-hr-line": {
      display: "inline-block",
      width: "100%",
      borderTop: "1px solid var(--hair)",
      verticalAlign: "middle",
    },

    // Browser-native spellcheck squigglies. The default red clashes with the
    // parchment/gold writing surface, so retint to goldink-on-gold — same hue
    // family as our other live-preview markers, just a touch warmer so it
    // still reads as a warning rather than decoration.
    ".cm-content ::spelling-error": {
      textDecoration: "underline wavy var(--goldbri)",
      textDecorationThickness: "1px",
      textUnderlineOffset: "3px",
    },
  },
  { dark: true },
);

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  title,
}: MarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Frontmatter from the *current* value, kept in a ref so the change listener
  // re-attaches it on every save without re-creating the editor.
  const frontmatterRef = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const titleRef = useRef(title);
  titleRef.current = title;

  // Create the editor once.
  useEffect(() => {
    if (!containerRef.current) return;

    const { body, frontmatter } = stripFrontmatter(value);
    frontmatterRef.current = frontmatter;

    const extensions = [
      history(),
      drawSelection(),
      indentOnInput(),
      markdown(),
      titleField,
      livePreviewPlugin,
      writingTheme,
      EditorView.lineWrapping,
      // Browser-native spellcheck on the contenteditable. Without this, the
      // `spellCheck` attribute on our wrapper <div> is a no-op — CodeMirror
      // owns the editable surface and ignores the host's spellcheck flag.
      // We set it both as a content attribute and an editor attribute for
      // belt-and-braces: some browsers key off one, some the other.
      EditorView.contentAttributes.of({ spellcheck: "true" }),
      EditorView.editorAttributes.of({ spellcheck: "true" }),
      // Quote line continuation / exit (Enter, Backspace). Prec.high so this
      // runs before defaultKeymap; commands return false on non-quote lines
      // to fall through to the default handlers.
      quoteKeymap,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const nextBody = update.state.doc.toString();
          onChangeRef.current(
            attachFrontmatter(nextBody, frontmatterRef.current),
          );
        }
      }),
      formattingKeymap,
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    ];

    if (placeholder) {
      extensions.push(
        EditorView.contentAttributes.of({ "aria-placeholder": placeholder }),
      );
    }

    const view = new EditorView({
      state: EditorState.create({ doc: body, extensions }),
      parent: containerRef.current,
    });
    viewRef.current = view;

    // Seed the inline title (titleRef holds the latest value at mount).
    if (titleRef.current) {
      view.dispatch({ effects: setTitleEffect.of(titleRef.current) });
    }

    // Mobile keyboard handling. The viewport setting `interactiveWidget:
    // "resizes-content"` (app/layout.tsx) already shrinks the fixed app shell
    // when the on-screen keyboard opens, so the editor's scroller contracts to
    // sit above the keyboard. But CodeMirror doesn't re-scroll the caret into
    // the now-shorter viewport on its own, so the active line can hide behind
    // the keyboard on first focus. Listen for visualViewport resizes and pull
    // the cursor back into view — the editor equivalent of the composer riding
    // up above the keyboard.
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    let raf = 0;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const revealCaret = () => {
      if (!view.hasFocus) return;
      view.dispatch({
        effects: EditorView.scrollIntoView(view.state.selection.main.head, {
          // Center (not "nearest") so the caret is actively pulled up every
          // time the keyboard opens — "nearest" no-ops when the caret is still
          // within the pre-resize bounds, which is why it only worked once the
          // doc was already scrolled to the bottom.
          y: "center",
        }),
      });
    };
    const onViewportResize = () => {
      // iOS resizes the visual viewport in stages as the keyboard animates in,
      // so run once on the next frame AND once after the animation settles —
      // the early pass handles the common case, the late pass corrects for the
      // final keyboard height.
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(revealCaret);
      clearTimeout(settleTimer);
      settleTimer = setTimeout(revealCaret, 300);
    };
    vv?.addEventListener("resize", onViewportResize);

    return () => {
      vv?.removeEventListener("resize", onViewportResize);
      cancelAnimationFrame(raf);
      clearTimeout(settleTimer);
      view.destroy();
      viewRef.current = null;
    };
    // Editor is created once; external value changes flow through the effect
    // below. placeholder is read at creation only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value → editor without stomping the cursor. We only dispatch
  // when the incoming body differs from what's already in the doc (i.e. a real
  // external change like loading a different entry — not the echo of our own
  // onChange round-tripping back through React).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const { body, frontmatter } = stripFrontmatter(value);
    // Keep frontmatter ref current so saves don't reattach stale YAML.
    frontmatterRef.current = frontmatter;
    const currentBody = view.state.doc.toString();
    if (currentBody === body) return;
    view.dispatch({
      changes: { from: 0, to: currentBody.length, insert: body },
      // Park the selection at the document start for a freshly-loaded entry,
      // mapped through the change so it stays valid.
      selection: { anchor: 0 },
    });
  }, [value]);

  // Sync the inline title when it changes (e.g. switching entries).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setTitleEffect.of(title ?? "") });
  }, [title]);

  return (
    <div
      ref={containerRef}
      className="h-full overflow-hidden bg-panel"
      spellCheck
    />
  );
}

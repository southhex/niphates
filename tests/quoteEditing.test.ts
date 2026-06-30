// tests/quoteEditing.test.ts
// Tests for the pure decision functions that drive blockquote Enter and
// Backspace behavior. These cover the Obsidian-style quote editing the
// MarkdownEditor aims to match:
//   - Enter inside `> line` continues the quote on the next line.
//   - Enter inside an empty `> ` line exits the quote.
//   - Backspace on a non-empty quote line (e.g. `> hello`) does NOT
//     override the default handler — it deletes one character at a time,
//     matching Obsidian. A previous version of this code wiped the `> `
//     marker as soon as the cursor entered the leading marker zone, which
//     with the `>` hidden by our live-preview felt like the whole line
//     had been deleted.
//   - Backspace on an empty quote line (`> ` with no other content) does
//     a one-keystroke quote-exit.

import { describe, expect, it } from "vitest";
import {
  planQuoteEnter,
  planQuoteBackspace,
  quoteMarkerLength,
} from "../components/MarkdownEditor";

describe("planQuoteEnter", () => {
  it("returns null for non-quote lines (fall through to default Enter)", () => {
    expect(planQuoteEnter("hello world")).toBeNull();
    expect(planQuoteEnter("")).toBeNull();
    // The leading `> ` is required (the markdown grammar requires a space);
    // `>foo` and a bare `>` are not blockquote markers and fall through.
    expect(planQuoteEnter(">foo")).toBeNull();
    expect(planQuoteEnter(">")).toBeNull();
  });

  it("continues a non-empty `> ` quote on Enter (matches Obsidian)", () => {
    expect(planQuoteEnter("> hello")).toEqual({ insert: "\n> " });
    expect(planQuoteEnter("> line one")).toEqual({ insert: "\n> " });
  });

  it("exits the quote on Enter when the quote line is empty", () => {
    // `> ` with nothing after — Obsidian drops you out of the quote so
    // the next line is plain text.
    expect(planQuoteEnter("> ")).toEqual({ insert: "\n" });
  });
});

describe("planQuoteBackspace", () => {
  it("returns false for non-quote lines (fall through to default Backspace)", () => {
    expect(planQuoteBackspace("hello")).toBe(false);
    expect(planQuoteBackspace("")).toBe(false);
    // `>foo` and a bare `>` aren't quote markers, so the override is moot
    // and we let the default handler run (which is also the right thing
    // for these lines since they aren't quotes at all).
    expect(planQuoteBackspace(">foo")).toBe(false);
    expect(planQuoteBackspace(">")).toBe(false);
  });

  it("returns false for non-empty quote lines (one-char-at-a-time, not a wipe)", () => {
    // The user-perceived bug was: cursor at the visual start of `hello` in
    // `> hello`, press Backspace, and the whole line's quote styling
    // vanished. That happened because the override fired for any cursor
    // position in the leading marker zone. The fix is to ONLY fire on
    // empty quote lines — for any non-empty quote, let the default
    // Backspace handle it one character at a time.
    expect(planQuoteBackspace("> hello")).toBe(false);
    expect(planQuoteBackspace("> x")).toBe(false);
    expect(planQuoteBackspace(">")).toBe(false);
  });

  it("returns true for empty quote lines (one-keystroke quote exit)", () => {
    // `> ` with no other content — there's nothing to "step back through",
    // so a single Backspace removing the marker is the natural action.
    expect(planQuoteBackspace("> ")).toBe(true);
  });
});

describe("quoteMarkerLength", () => {
  it("returns the marker length for quote lines", () => {
    expect(quoteMarkerLength("> ")).toBe(2);
    expect(quoteMarkerLength("> hello")).toBe(2);
  });

  it("returns 0 for non-quote lines", () => {
    expect(quoteMarkerLength("hello")).toBe(0);
    expect(quoteMarkerLength("")).toBe(0);
    // No-space variants aren't quotes per the markdown grammar.
    expect(quoteMarkerLength(">")).toBe(0);
    expect(quoteMarkerLength(">hello")).toBe(0);
  });
});

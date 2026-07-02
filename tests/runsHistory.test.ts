import { describe, it, expect } from "vitest";
import { toConversationHistory, MAX_TOOL_OUTPUT } from "../lib/runsHistory";
import type { ChatBlock, ChatMessage } from "../lib/types";

function user(content: string): ChatMessage {
  return { role: "user", content };
}
function assistant(blocks: ChatBlock[]): ChatMessage {
  return { role: "assistant", content: "", blocks };
}

describe("toConversationHistory", () => {
  it("returns [] for no messages", () => {
    expect(toConversationHistory([])).toEqual([]);
  });

  it("passes user/system turns through as plain text, trimmed", () => {
    const out = toConversationHistory([
      { role: "system", content: "  be terse  " },
      user("  hello  "),
    ]);
    expect(out).toEqual([
      { role: "system", content: "be terse" },
      { role: "user", content: "hello" },
    ]);
  });

  it("folds an assistant turn's tool command AND output into its content", () => {
    const out = toConversationHistory([
      user("read the sheet"),
      assistant([
        { type: "text", text: "Let me look." },
        {
          type: "tool",
          tool: "Terminal",
          status: "completed",
          preview: "cat budget.csv",
          output: "Period,June 2026",
        },
        { type: "text", text: "The period says June." },
      ]),
    ]);
    expect(out).toHaveLength(2);
    const asst = out[1].content;
    // spoken text survives
    expect(asst).toContain("Let me look.");
    expect(asst).toContain("The period says June.");
    // the tool command AND its captured output survive — the whole point
    expect(asst).toContain("cat budget.csv");
    expect(asst).toContain("Period,June 2026");
    // retrospective prose framing, NOT a parrotable "[tool: …]" tag
    expect(asst).toContain("ran Terminal");
    expect(asst).not.toContain("[tool:");
  });

  it("drops reasoning blocks (ephemeral thinking, not answer content)", () => {
    const out = toConversationHistory([
      assistant([
        { type: "reasoning", text: "secret chain of thought" },
        { type: "text", text: "answer" },
      ]),
    ]);
    expect(out[0].content).toBe("answer");
    expect(out[0].content).not.toContain("secret chain of thought");
  });

  it("marks errored tools", () => {
    const out = toConversationHistory([
      assistant([
        {
          type: "tool",
          tool: "web_extract",
          status: "completed",
          preview: "fetch url",
          error: true,
        },
      ]),
    ]);
    // errored tools read as "tried" rather than "ran"
    expect(out[0].content).toContain("tried web_extract");
  });

  it("condenses a multi-line command to a single short line (no echoed code block)", () => {
    const code = "import json\nimport sys\n" + "x = 1\n".repeat(80);
    const out = toConversationHistory([
      assistant([
        { type: "tool", tool: "execute_code", status: "completed", preview: code },
      ]),
    ]);
    const line = out[0].content;
    expect(line).toContain("ran execute_code");
    // collapsed to one line — no embedded newlines from the command
    expect(line.split("\n")).toHaveLength(1);
    expect(line).toContain("…");
  });

  it("truncates very long tool output to the cap", () => {
    const big = "x".repeat(MAX_TOOL_OUTPUT + 500);
    const out = toConversationHistory([
      assistant([
        { type: "tool", tool: "Read", status: "completed", output: big },
      ]),
    ]);
    expect(out[0].content).toContain("truncated 500 chars");
    expect(out[0].content.length).toBeLessThan(big.length);
  });

  it("falls back to flat content + toolCalls for legacy messages (no blocks)", () => {
    const legacy: ChatMessage = {
      role: "assistant",
      content: "done",
      toolCalls: [
        {
          tool: "Bash",
          status: "completed",
          preview: "ls",
          output: "file.txt",
        },
      ],
    };
    const out = toConversationHistory([user("hi"), legacy]);
    expect(out[1].content).toContain("done");
    expect(out[1].content).toContain("ran Bash");
    expect(out[1].content).toContain("ls");
    expect(out[1].content).toContain("file.txt");
  });

  it("skips turns that render empty (never emits blank content)", () => {
    const out = toConversationHistory([
      { role: "assistant", content: "", blocks: [] },
      user(""),
      user("real"),
    ]);
    expect(out).toEqual([{ role: "user", content: "real" }]);
  });

  it("round-trips a multi-turn conversation preserving prior tool work", () => {
    const convo: ChatMessage[] = [
      user("confirm you can see my budget sheet"),
      assistant([
        {
          type: "tool",
          tool: "Terminal",
          status: "completed",
          preview: "google_api sheets get ...",
          output: "C1: June 2026",
        },
        { type: "text", text: "Yes — the period cell says June 2026." },
      ]),
      user("update it to July"),
    ];
    const out = toConversationHistory(convo);
    expect(out.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    // On the next turn the model can SEE it already read the sheet.
    expect(out[1].content).toContain("June 2026");
    expect(out[1].content).toContain("google_api sheets get");
  });
});

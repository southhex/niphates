import { describe, it, expect } from "vitest";
import { extractModelIds } from "../lib/modelDiscovery";

describe("extractModelIds", () => {
  it("pulls ids from an OpenAI /models payload", () => {
    expect(
      extractModelIds({ data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] }),
    ).toEqual(["gpt-4o", "gpt-4o-mini"]);
  });

  it("handles Hermes profiles (same shape, spaced names)", () => {
    expect(
      extractModelIds({ object: "list", data: [{ id: "Michael's Agent" }] }),
    ).toEqual(["Michael's Agent"]);
  });

  it("tolerates string entries and drops empties", () => {
    expect(extractModelIds({ data: ["a", { id: "" }, { id: "b" }] })).toEqual([
      "a",
      "b",
    ]);
  });

  it("returns [] for non-list payloads", () => {
    expect(extractModelIds({})).toEqual([]);
    expect(extractModelIds(null)).toEqual([]);
  });
});

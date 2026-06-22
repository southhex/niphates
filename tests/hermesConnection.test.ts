import { describe, it, expect } from "vitest";
import { toPublicConnection } from "../lib/hermesAuth";
import { hermesConnectionInputSchema } from "../lib/schemas";

describe("toPublicConnection", () => {
  it("redacts secrets to booleans and exposes the chat base URL", () => {
    const pub = toPublicConnection({
      adminBaseUrl: "http://100.127.15.14:9119",
      authMode: "session",
      token: "secret-tok",
      chatBaseUrl: "http://100.127.15.14:8642/v1",
      chatKey: "secret-key",
    });
    expect(pub).toEqual({
      adminBaseUrl: "http://100.127.15.14:9119",
      authMode: "session",
      hasToken: true,
      isLoopback: false,
      chatBaseUrl: "http://100.127.15.14:8642/v1",
      hasChatKey: true,
    });
    // The raw secrets must never appear on the public view.
    expect(JSON.stringify(pub)).not.toContain("secret-tok");
    expect(JSON.stringify(pub)).not.toContain("secret-key");
  });

  it("reports missing chat key / base url", () => {
    const pub = toPublicConnection({
      adminBaseUrl: "http://127.0.0.1:9119",
      authMode: "auto",
    });
    expect(pub.hasChatKey).toBe(false);
    expect(pub.chatBaseUrl).toBeUndefined();
    expect(pub.isLoopback).toBe(true);
  });
});

describe("hermesConnectionInputSchema", () => {
  it("accepts the chat endpoint fields", () => {
    const r = hermesConnectionInputSchema.safeParse({
      adminBaseUrl: "http://127.0.0.1:9119",
      chatBaseUrl: "http://127.0.0.1:8642/v1",
      chatKey: "k",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a malformed chat base URL", () => {
    const r = hermesConnectionInputSchema.safeParse({ chatBaseUrl: "not-a-url" });
    expect(r.success).toBe(false);
  });

  it("allows a blank chatKey (means keep existing)", () => {
    const r = hermesConnectionInputSchema.safeParse({ chatKey: "" });
    expect(r.success).toBe(true);
  });
});

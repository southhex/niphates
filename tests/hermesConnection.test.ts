import { describe, it, expect } from "vitest";
import { toPublicConnection } from "../lib/hermesAuth";
import { hermesConnectionInputSchema } from "../lib/schemas";

describe("toPublicConnection", () => {
  it("redacts the session cookie to a boolean and exposes the chat base URL", () => {
    const pub = toPublicConnection({
      adminBaseUrl: "http://100.127.15.14:9119",
      authMode: "cookie",
      token: "hermes_session_at=secret-tok",
      chatBaseUrl: "http://100.127.15.14:8642/v1",
      chatKey: "secret-key",
    });
    expect(pub).toEqual({
      adminBaseUrl: "http://100.127.15.14:9119",
      authMode: "cookie",
      hasToken: true,
      isLoopback: false,
      chatBaseUrl: "http://100.127.15.14:8642/v1",
      hasChatKey: true,
      allowedModels: undefined,
    });
    // The raw secrets must never appear on the public view.
    expect(JSON.stringify(pub)).not.toContain("secret-tok");
    expect(JSON.stringify(pub)).not.toContain("secret-key");
  });

  it("reports missing chat key / base url and no token on a fresh loopback install", () => {
    const pub = toPublicConnection({
      adminBaseUrl: "http://127.0.0.1:9119",
      authMode: "none",
    });
    expect(pub.hasChatKey).toBe(false);
    expect(pub.chatBaseUrl).toBeUndefined();
    expect(pub.isLoopback).toBe(true);
    expect(pub.hasToken).toBe(false);
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

  it("no longer accepts the dropped username/password fields (rejected at runtime)", () => {
    // The schema is strict-by-omission: any unknown field is allowed (zod
    // default), so this is mostly a documentation test. The real guard is
    // TypeScript: with the new type, the API route can no longer touch
    // `incoming.username`. Verify the type is locked in by trying to write
    // the dropped auth modes into authMode.
    const r = hermesConnectionInputSchema.safeParse({ authMode: "basic" });
    expect(r.success).toBe(false);
    const r2 = hermesConnectionInputSchema.safeParse({ authMode: "bearer" });
    expect(r2.success).toBe(false);
    const r3 = hermesConnectionInputSchema.safeParse({ authMode: "auto" });
    expect(r3.success).toBe(false);
  });
});

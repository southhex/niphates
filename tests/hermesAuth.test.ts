import { describe, it, expect } from "vitest";
import { isLoopbackUrl, authHeaders } from "../lib/hermesAuth";

describe("isLoopbackUrl", () => {
  it("recognizes loopback hosts", () => {
    expect(isLoopbackUrl("http://localhost:9119")).toBe(true);
    expect(isLoopbackUrl("http://127.0.0.1:9119")).toBe(true);
    expect(isLoopbackUrl("http://[::1]:9119")).toBe(true);
    expect(isLoopbackUrl("http://foo.localhost")).toBe(true);
  });

  it("treats remote hosts as non-loopback", () => {
    expect(isLoopbackUrl("https://hermes.example.com")).toBe(false);
    expect(isLoopbackUrl("http://192.168.1.10:9119")).toBe(false);
  });

  it("returns false for garbage input", () => {
    expect(isLoopbackUrl("not a url")).toBe(false);
  });
});

describe("authHeaders", () => {
  it("none mode never sends auth even with a token", () => {
    expect(
      authHeaders({ adminBaseUrl: "https://hermes.example.com", authMode: "none", token: "t" }),
    ).toEqual({});
  });

  it("none mode on loopback sends nothing", () => {
    expect(
      authHeaders({ adminBaseUrl: "http://127.0.0.1:9119", authMode: "none" }),
    ).toEqual({});
  });

  it("cookie mode sends Cookie: <token>", () => {
    expect(
      authHeaders({ adminBaseUrl: "http://127.0.0.1:9119", authMode: "cookie", token: "sid=abc" }),
    ).toEqual({ Cookie: "sid=abc" });
  });

  it("cookie mode on a non-loopback host sends Cookie: <token>", () => {
    expect(
      authHeaders({ adminBaseUrl: "https://hermes.example.com", authMode: "cookie", token: "sid=abc" }),
    ).toEqual({ Cookie: "sid=abc" });
  });

  it("cookie mode without a token sends nothing", () => {
    expect(
      authHeaders({ adminBaseUrl: "https://hermes.example.com", authMode: "cookie" }),
    ).toEqual({});
  });

  it("cookie mode on loopback without a token sends nothing (no empty Cookie header)", () => {
    expect(
      authHeaders({ adminBaseUrl: "http://127.0.0.1:9119", authMode: "cookie" }),
    ).toEqual({});
  });
});

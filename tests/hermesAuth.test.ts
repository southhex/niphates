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
  it("auto: sends nothing on loopback", () => {
    expect(
      authHeaders({
        adminBaseUrl: "http://127.0.0.1:9119",
        authMode: "auto",
        token: "secret",
      }),
    ).toEqual({});
  });

  it("auto: sends bearer on a non-loopback host when a token is present", () => {
    expect(
      authHeaders({
        adminBaseUrl: "https://hermes.example.com",
        authMode: "auto",
        token: "secret",
      }),
    ).toEqual({ Authorization: "Bearer secret" });
  });

  it("auto: sends nothing off-loopback when no token", () => {
    expect(
      authHeaders({ adminBaseUrl: "https://hermes.example.com", authMode: "auto" }),
    ).toEqual({});
  });

  it("explicit bearer / cookie modes build the right header", () => {
    expect(
      authHeaders({ adminBaseUrl: "http://127.0.0.1:9119", authMode: "bearer", token: "t" }),
    ).toEqual({ Authorization: "Bearer t" });
    expect(
      authHeaders({ adminBaseUrl: "http://127.0.0.1:9119", authMode: "cookie", token: "sid=abc" }),
    ).toEqual({ Cookie: "sid=abc" });
  });

  it("none mode never sends auth even with a token", () => {
    expect(
      authHeaders({ adminBaseUrl: "https://hermes.example.com", authMode: "none", token: "t" }),
    ).toEqual({});
  });
});

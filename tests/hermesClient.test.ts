import { describe, it, expect, vi, afterEach } from "vitest";
import { hermesApi } from "../lib/hermesClient";

afterEach(() => vi.unstubAllGlobals());

describe("hermesApi.setModel", () => {
  it("POSTs /api/hx/model/set with the main-scope model assignment", async () => {
    // Hermes' /api/model/set only accepts POST and requires a `scope` field;
    // the active/primary model lives under scope "main". (PUT → 405; missing
    // scope → 422.)
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await hermesApi.setModel("deepseek/deepseek-v4-flash", "openrouter");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/hx/model/set");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      scope: "main",
      model: "deepseek/deepseek-v4-flash",
      provider: "openrouter",
      confirm_expensive_model: true,
    });
  });
});

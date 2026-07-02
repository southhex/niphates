"use client";

import { useEffect } from "react";

// A content-hashed route chunk that existed when this tab loaded can vanish the
// moment a new production build lands (the rebuild rewrites every hash). Next
// then throws `ChunkLoadError` when it tries to lazy-load the now-404 chunk —
// classic "open tab straddling a redeploy", and unavoidable for a long-lived
// installed PWA. The only real recovery is to re-fetch the current HTML +
// manifest, so we force a single hard reload.
//
// Guarded by sessionStorage so a genuinely broken chunk (not a redeploy) can't
// spin the page in a reload loop: we reload at most once per RELOAD_WINDOW_MS.
const RELOAD_KEY = "niphates-chunk-reload-at";
const RELOAD_WINDOW_MS = 30_000;

function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const name = (err as { name?: unknown }).name;
  if (name === "ChunkLoadError") return true;
  const message = String((err as { message?: unknown }).message ?? err);
  return /Loading (CSS )?chunk .* failed|ChunkLoadError/i.test(message);
}

/** Reloads once when a route chunk 404s after a redeploy. */
export function ChunkReload() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const recover = () => {
      let last = 0;
      try {
        last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
      } catch {
        /* storage disabled — fall through and reload anyway */
      }
      if (Date.now() - last < RELOAD_WINDOW_MS) return; // already tried; avoid a loop
      try {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      } catch {
        /* non-fatal */
      }
      window.location.reload();
    };

    const onError = (e: ErrorEvent) => {
      if (isChunkLoadError(e.error) || isChunkLoadError(e.message)) recover();
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isChunkLoadError(e.reason)) recover();
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}

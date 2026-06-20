/**
 * Config is phase-aware so `next dev` and `next build`/`next start` never share a
 * build directory. They both default to `.next`, and running them from the same
 * folder lets the dev server's on-demand recompiles overwrite the production
 * chunks (and vice versa) — a corrupted `.next` then makes `next start` throw at
 * runtime and serve the unstyled error page. Isolating dev to `.next-dev` makes
 * that whole class of breakage impossible.
 *
 * `"phase-development-server"` is the value of `PHASE_DEVELOPMENT_SERVER` from
 * `next/constants`; inlined as a literal to keep this config free of import
 * resolution quirks.
 *
 * @param {string} phase
 * @returns {import('next').NextConfig}
 */
export default function config(phase) {
  const isDev = phase === "phase-development-server";
  return {
    reactStrictMode: true,
    // dev → .next-dev; build + start → .next (the default).
    distDir: isDev ? ".next-dev" : ".next",
    // Allow self-hosting behind a reverse proxy without surprises.
    async headers() {
      return [
        {
          source: "/sw.js",
          headers: [
            { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
            { key: "Service-Worker-Allowed", value: "/" },
          ],
        },
      ];
    },
  };
}

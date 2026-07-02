import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // CSS relative color syntax gives every token a real alpha channel, so
      // opacity modifiers (bg-gold/10, border-gold/40, …) work — with a plain
      // `var(--gold)` value Tailwind can't inject alpha and the modifier
      // silently no-ops.
      colors: Object.fromEntries(
        [
          "void", "ground", "paneldk", "panel", "panel2", "hair", "hairlit",
          "marble", "parch", "parchdk", "muted", "mutedlo", "gold", "goldbri",
          "goldink", "lapis", "malach", "carnelian", "porphyry", "porphlbl",
          "agentbody",
        ].map((name) => [
          name,
          `rgb(from var(--${name}) r g b / <alpha-value>)`,
        ]),
      ),
      fontFamily: {
        sans:    ["var(--font-mono)", "ui-monospace", "monospace"],
        display: ["var(--font-cinzel)", "serif"],
        read:    ["var(--font-spectral)", "serif"],
        mono:    ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;

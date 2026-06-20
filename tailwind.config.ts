import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        void:      "var(--void)",
        ground:    "var(--ground)",
        paneldk:   "var(--paneldk)",
        panel:     "var(--panel)",
        panel2:    "var(--panel2)",
        hair:      "var(--hair)",
        hairlit:   "var(--hairlit)",
        marble:    "var(--marble)",
        parch:     "var(--parch)",
        parchdk:   "var(--parchdk)",
        muted:     "var(--muted)",
        mutedlo:   "var(--mutedlo)",
        gold:      "var(--gold)",
        goldbri:   "var(--goldbri)",
        goldink:   "var(--goldink)",
        lapis:     "var(--lapis)",
        malach:    "var(--malach)",
        carnelian: "var(--carnelian)",
        porphyry:  "var(--porphyry)",
        porphlbl:  "var(--porphlbl)",
        agentbody: "var(--agentbody)",
      },
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

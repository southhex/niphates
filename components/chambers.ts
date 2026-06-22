// components/chambers.ts
// Pure shared metadata for the Chambers navigation. No "server-only" — imported
// by client components (Sidebar, page, ChamberPlaceholder).

export type ChamberId = "dialogue" | "studio" | "library" | "council" | "command";

export interface ChamberDef {
  id: ChamberId;
  name: string; // uppercase display name
  numeral: string; // Roman numeral shown on the right of each row
}

export const CHAMBERS: ChamberDef[] = [
  { id: "dialogue", name: "DIALOGUE", numeral: "I" },
  { id: "studio", name: "STUDIO", numeral: "II" },
  { id: "library", name: "LIBRARY", numeral: "III" },
  { id: "council", name: "COUNCIL", numeral: "IV" },
  { id: "command", name: "COMMAND", numeral: "V" },
];

/** A chamber's main tabs, shown in the sidebar's subsection area. */
export interface SubsectionDef {
  id: string;
  label: string;
}

/**
 * Per-chamber subsections (the chamber's main tabs). Dialogue is special-cased
 * in the sidebar (conversation list), so it has none here. Chambers absent from
 * this map fall back to a "not yet built" placeholder.
 */
export const CHAMBER_SUBSECTIONS: Partial<Record<ChamberId, SubsectionDef[]>> = {
  command: [
    { id: "sessions", label: "Sessions" },
    { id: "models", label: "Models" },
    { id: "cron", label: "Cron" },
    { id: "memory", label: "Memory" },
    { id: "voice", label: "Voice" },
    { id: "channels", label: "Channels" },
    { id: "keys", label: "Keys" },
  ],
};

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

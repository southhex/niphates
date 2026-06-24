// components/LibraryView.tsx
// The Library chamber — journal, references, and knowledge resources. Routed
// by subsection; delegates to the per-subsection view component.
"use client";

import { SanctumView } from "@/components/SanctumView";
import { CHAMBER_SUBSECTIONS } from "@/components/chambers";

export function LibraryView({ section }: { section: string }) {
  const sectionLabel =
    CHAMBER_SUBSECTIONS.library?.find((s) => s.id === section)?.label ??
    "Library";

  if (section === "sanctum") {
    return <SanctumView />;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 font-display text-[32px] font-semibold tracking-[0.06em] text-marble">
        {sectionLabel}
      </h1>
      <div className="border border-hair bg-paneldk p-8 text-center font-mono text-[12px] text-mutedlo">
        {sectionLabel} — coming soon.
      </div>
    </div>
  );
}

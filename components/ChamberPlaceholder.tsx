// components/ChamberPlaceholder.tsx
import { CHAMBERS, type ChamberId } from "@/components/chambers";

export function ChamberPlaceholder({ chamber }: { chamber: ChamberId }) {
  const def = CHAMBERS.find((c) => c.id === chamber);
  if (!def) return null;

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div
        className="mb-[14px] font-display text-[13px] tracking-[0.34em] text-gold"
        style={{ textShadow: "0 0 10px color-mix(in srgb, var(--gold) 50%, transparent)" }}
      >
        {def.numeral}
      </div>
      <h2 className="font-display text-[40px] font-semibold tracking-[0.1em] text-marble">
        {def.name}
      </h2>
      <div
        className="my-5 h-px w-full max-w-[240px]"
        style={{
          background:
            "linear-gradient(90deg,transparent,var(--gold),transparent)",
        }}
      />
      <p className="font-read italic text-[16px] text-parch">
        This chamber is not yet built.
      </p>
    </div>
  );
}

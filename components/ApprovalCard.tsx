"use client";

import { ShieldAlert } from "lucide-react";

export interface PendingApproval {
  runId: string;
  approvalId: string;
  tool?: string;
  command: string;
  description?: string;
}

type Choice = "once" | "session" | "always" | "deny";

const CHOICES: { choice: Choice; label: string; primary?: boolean }[] = [
  { choice: "once", label: "Allow once", primary: true },
  { choice: "session", label: "Allow for session" },
  { choice: "always", label: "Always allow" },
  { choice: "deny", label: "Deny" },
];

export function ApprovalCard({
  approval,
  onRespond,
}: {
  approval: PendingApproval;
  onRespond: (choice: Choice) => void;
}) {
  return (
    <div className="mx-auto mb-2 w-full max-w-[720px] px-6" style={{ zoom: 0.9 }}>
      <div className="border border-gold/40 bg-panel px-4 py-3">
        <div className="mb-2 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.28em] text-gold">
          <ShieldAlert size={12} />
          <span>approval required{approval.tool ? ` · ${approval.tool}` : ""}</span>
        </div>
        {(approval.command || approval.tool) && (
          <pre className="mb-1.5 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[12px] text-marble">
            {approval.command || approval.tool}
          </pre>
        )}
        {approval.description && (
          <p className="mb-2 font-read text-[13px] italic text-parch">
            {approval.description}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {CHOICES.map(({ choice, label, primary }) => (
            <button
              key={choice}
              type="button"
              onClick={() => onRespond(choice)}
              className={
                primary
                  ? "border border-gold px-3 py-1 font-mono text-[11.5px] text-gold hover:bg-gold/10"
                  : choice === "deny"
                    ? "border border-hair px-3 py-1 font-mono text-[11.5px] text-carnelian hover:bg-carnelian/10"
                    : "border border-hair px-3 py-1 font-mono text-[11.5px] text-parch hover:bg-hair"
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

"use client";
// M5.3 agent card (minimal): name, ENS, role, balance, credit score, last decision, bubble.
import type { AgentSummary } from "@agent-town/shared";
import { formatUsdc } from "@/lib/usdc";

export function AgentCard({
  agent,
  selected,
  onSelect,
}: {
  agent: AgentSummary;
  selected: boolean;
  onSelect: (name: string | null) => void;
}) {
  return (
    <button
      type="button"
      className="agent"
      aria-pressed={selected}
      onClick={() => onSelect(selected ? null : agent.name)}
      style={{ textAlign: "left" }}
    >
      {/* plain img: sprites are tiny PNGs served from /public, no optimisation wanted */}
      <img src={agent.avatar} alt="" width={48} height={48} />
      <div style={{ minWidth: 0 }}>
        <div className="name" title={agent.ensName}>
          {agent.ensName}
        </div>
        <div className="label">
          {agent.role}
          {agent.creditScore != null ? ` · score ${agent.creditScore}` : ""}
        </div>
        <div className="balance">{formatUsdc(agent.balanceUsdc)} USDC</div>
      </div>
      <div className="bubble">
        {agent.narration ?? (agent.lastDecision ? agent.lastDecision.summary : "")}
      </div>
    </button>
  );
}

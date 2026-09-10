"use client";
// M5.3 agent card: name, ENS, role, balance, credit score, last decision, bubble, and the
// two link-outs from PRD §6.2 (arcscan wallet, ENS name). Selection is a real button so
// keyboard users get it; the links sit beside it rather than inside it.
import { ExternalLink } from "lucide-react";
import type { AgentSummary } from "@agent-town/shared";
import { formatUsdc } from "@/lib/usdc";
import { arcAddressUrl, displayEnsName, ensExplorerUrl } from "@/lib/links";

export function AgentCard({
  agent,
  selected,
  onSelect,
}: {
  agent: AgentSummary;
  selected: boolean;
  onSelect: (name: string | null) => void;
}) {
  const ens = displayEnsName(agent.ensName);
  return (
    <article className="agent" data-selected={selected}>
      {/* plain img: sprites are tiny PNGs served from /public, no optimisation wanted */}
      <img src={agent.avatar} alt="" width={48} height={48} />
      <button
        type="button"
        className="agent-select"
        aria-pressed={selected}
        aria-label={`${ens}, ${agent.role}, ${formatUsdc(agent.balanceUsdc)} USDC`}
        onClick={() => onSelect(selected ? null : agent.name)}
      >
        <span className="name" title={ens}>
          {ens}
        </span>
        <span className="label">
          {agent.role}
          {agent.creditScore != null ? ` · score ${agent.creditScore}` : ""}
        </span>
        <span className="balance">{formatUsdc(agent.balanceUsdc)} USDC</span>
      </button>
      <span className="agent-links">
        <a
          href={arcAddressUrl(agent.arcAddress)}
          target="_blank"
          rel="noreferrer"
          title="Wallet on arcscan"
        >
          arcscan <ExternalLink size={10} aria-hidden="true" />
        </a>
        <a
          href={ensExplorerUrl(agent.ensName)}
          target="_blank"
          rel="noreferrer"
          title="Name on the ENS explorer"
        >
          ens <ExternalLink size={10} aria-hidden="true" />
        </a>
      </span>
      <div className="bubble">
        {agent.narration ?? (agent.lastDecision ? agent.lastDecision.summary : "")}
      </div>
    </article>
  );
}

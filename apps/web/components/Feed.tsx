"use client";
// M5.6 event feed: every tx with an explorer link, every line of dialogue,
// flagged loans in Sand. Newest first. Reads the reducer's ring buffer only.
import { ExternalLink } from "lucide-react";
import type { SseEvent } from "@agent-town/shared";
import type { FeedItem } from "@/lib/store";
import type { Loan } from "@agent-town/shared";
import { txDirection, isMonetary } from "@/lib/direction";
import { formatUsdc } from "@/lib/usdc";

function eventTick(e: SseEvent): number {
  switch (e.event) {
    case "loan_flagged":
      return e.data.requestedAtTick;
    case "scoreboard":
      return e.data.ticks;
    default:
      return e.data.tick;
  }
}

function Line({ e }: { e: SseEvent }) {
  switch (e.event) {
    case "tick":
      return (
        <span className="t">
          round {e.data.tick} · {e.data.phase}
        </span>
      );
    case "tx": {
      const d = txDirection(e.data.kind, e.data.agent, e.data.counterparty);
      const money = isMonetary(e.data);
      return (
        <span>
          {money ? `${d.from} → ${d.to} ${formatUsdc(e.data.amountUsdc)} ` : `${e.data.agent} `}
          <span className="t">{e.data.kind}</span>
        </span>
      );
    }
    case "narration":
      return (
        <span className="say">
          {e.data.agent}: “{e.data.text}”
        </span>
      );
    case "loan_flagged":
      return (
        <span className="flag">
          loan {e.data.id} for {e.data.borrower} · {formatUsdc(e.data.principalUsdc)} · needs the
          mayor
        </span>
      );
    case "scoreboard":
      return <span className="t">gdp {formatUsdc(e.data.gdpUsdc)}</span>;
  }
}

export function Feed({ items, pending }: { items: FeedItem[]; pending: Loan[] }) {
  const visible = [...items].reverse().filter((i) => i.event.event !== "scoreboard");
  return (
    <section className="card" aria-label="Event feed">
      <div className="card-title">
        <span className="h3">Feed</span>
        <span className="label">
          {pending.length > 0
            ? `${pending.length} loan${pending.length > 1 ? "s" : ""} waiting`
            : "live"}
        </span>
      </div>
      {visible.length === 0 ? (
        <div className="empty">The town is quiet. Events land here as rounds happen.</div>
      ) : (
        <ul className="feed">
          {visible.map((i) => (
            <li key={i.id}>
              <span className="t">{eventTick(i.event)}</span>
              <Line e={i.event} />
              {i.event.event === "tx" ? (
                <a
                  href={i.event.data.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open on arcscan"
                >
                  <ExternalLink size={12} aria-hidden="true" />
                </a>
              ) : (
                <span />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

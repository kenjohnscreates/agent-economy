// Town roster — the 8 named agents, their roles, home buildings and sprites.
// Source: PRD §3 (6–8 agents, 4 roles) and §12 (names ada, bo, …, hal).
// Inputs: none (static). Outputs: `ROSTER`, `Role`/`Building` unions + zod
// schemas, and `ensNameFor(label, town)` to build `<label>.<town>.eth`.
// The town label is NOT hardcoded — it comes from env `ENS_TOWN_NAME`.
import { z } from "zod";

/** Agent role (also the value of the ENS `town.role` record). */
export const ROLES = ["treasurer", "merchant", "worker", "consumer"] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

/** The four town buildings agents move between (ARCHITECTURE §9). */
export const BUILDINGS = ["bank", "market", "workshop", "homes"] as const;
export const BuildingSchema = z.enum(BUILDINGS);
export type Building = z.infer<typeof BuildingSchema>;

/** Short agent label — the ENS leaf, e.g. "ada" in `ada.<town>.eth`. */
export const AGENT_NAMES = ["ada", "bo", "cy", "dee", "eli", "fay", "gus", "hal"] as const;
export const AgentNameSchema = z.enum(AGENT_NAMES);
export type AgentName = z.infer<typeof AgentNameSchema>;

/** Static roster entry. Runtime fields (balance, position…) live in `AgentSummary`. */
export const RosterEntrySchema = z.object({
  name: AgentNameSchema,
  role: RoleSchema,
  home: BuildingSchema,
  /** Sprite path served by the FE, `/sprites/<name>.png`. */
  avatar: z.string().regex(/^\/sprites\/[a-z]+\.png$/),
  /** One-line persona for the narrator prompt. */
  persona: z.string().min(1).max(160),
});
export type RosterEntry = z.infer<typeof RosterEntrySchema>;

const HOME_BY_ROLE: Record<Role, Building> = {
  treasurer: "bank",
  merchant: "market",
  worker: "workshop",
  consumer: "homes",
};

function entry(name: AgentName, role: Role, persona: string): RosterEntry {
  return { name, role, home: HOME_BY_ROLE[role], avatar: `/sprites/${name}.png`, persona };
}

/** Exactly 8 agents: 1 treasurer, 2 merchants, 3 workers, 2 consumers. */
export const ROSTER: readonly RosterEntry[] = [
  entry("ada", "treasurer", "Cautious town banker who prices risk and never lends blind."),
  entry(
    "bo",
    "merchant",
    "Upbeat shopkeeper who restocks fast and borrows when the till runs dry.",
  ),
  entry("cy", "merchant", "Thrifty trader who watches DEX volume before setting prices."),
  entry("dee", "worker", "Reliable craftsperson who saves a fifth of every payout."),
  entry("eli", "worker", "Ambitious builder who bids on the best-paying job first."),
  entry("fay", "worker", "Easygoing artisan who sometimes forgets a loan is due."),
  entry("gus", "consumer", "Cheerful regular who shops whenever the wallet allows."),
  entry("hal", "consumer", "Frugal retiree living on the town stipend and small treats."),
] as const;

/** Lookup helper; throws on unknown label so callers fail loudly. */
export function rosterEntry(name: AgentName): RosterEntry {
  const found = ROSTER.find((r) => r.name === name);
  if (!found) throw new Error(`Unknown roster agent: ${name}`);
  return found;
}

/** Placeholder used in docs/fixtures until `ENS_TOWN_NAME` is decided. */
export const TOWN_NAME_PLACEHOLDER = "<town>" as const;

/**
 * Build the full ENS name for an agent: `<label>.<town>.eth`.
 * `town` is the bare label (e.g. "agenttown"), not a full name.
 */
export function ensNameFor(label: string, town: string): string {
  const cleanTown = town.replace(/\.eth$/i, "");
  return `${label}.${cleanTown}.eth`;
}

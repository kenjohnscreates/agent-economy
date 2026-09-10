// Link-outs and name display (M5.8). arcscan is certain (shared constant). The ENSv2
// hackathon explorer's per-name route is not in the contract, so the link is a template:
// set NEXT_PUBLIC_ENS_EXPLORER_URL to e.g. "https://explorer.ens.dev/name/{name}" once
// known; without "{name}" the link lands on the explorer root, which never 404s.
import { ARC_EXPLORER_URL } from "@agent-town/shared";
import { TOWN_NAME } from "./config";

export const ENS_EXPLORER_URL: string =
  process.env["NEXT_PUBLIC_ENS_EXPLORER_URL"] ?? "https://explorer.ens.dev/";

/** The mock ships "ada.<town>.eth"; show the configured town instead of the placeholder. */
export function displayEnsName(ensName: string, town: string = TOWN_NAME): string {
  return ensName.replace("<town>", town);
}

export function arcAddressUrl(address: string): string {
  return `${ARC_EXPLORER_URL}/address/${address}`;
}

export function ensExplorerUrl(
  ensName: string,
  town: string = TOWN_NAME,
  template: string = ENS_EXPLORER_URL,
): string {
  const name = displayEnsName(ensName, town);
  return template.includes("{name}")
    ? template.replace("{name}", encodeURIComponent(name))
    : template;
}

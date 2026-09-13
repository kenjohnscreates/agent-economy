# @agent-town/ens

Names are how you **own the swarm**. Today: `botanica.eth`, eight roster agents, a visitor you mint, subagents as subdomains. Next: sell / rent / license those names. Pitch: [root README](../../README.md).

ENSv2 client for the **hackathon-frozen Sepolia deployment** (`deployments.json`, R2). ABIs in `src/abi/*` are hand-pinned to [ensdomains/namechain@48b3e2d](https://github.com/ensdomains/namechain/tree/48b3e2d39513b9dd32ef1850877a29009bc807b9) and selector-checked against deployed bytecode.

## Register `<ENS_TOWN_NAME>.eth` (M0.4) — two-phase commit-reveal on `ETHRegistrar`

| Command (`pnpm --filter @agent-town/ens register-town -- …`) | Broadcasts | Needs key |
| --- | --- | --- |
| `--status` · label availability, owner/subregistry/resolver, 1y price, commit ages, signer balances | no | no |
| `--dry-run` · `--status` + `eth_call` of `commit` and `register` (state-overridden), calldata + commitment | no | no |
| `--commit` · TX 1 `commit(hash)`; idempotent; writes secret to `.town-commit.json` (gitignored) | yes | yes |
| `--register` · waits ≥ `MIN_COMMITMENT_AGE` (60s, max 24h), mints/approves MockUSDC if short, TX 2 `register(...)`, re-reads owner | yes | yes |

Env: `SEPOLIA_RPC_URL` (read-only fallback: publicnode), `ENS_TREASURER_PRIVATE_KEY` (owner of the name), `ENS_TOWN_NAME=botanica`.
Human needs: ~0.01 Sepolia ETH for gas on the treasurer; registration is priced in **MockUSDC** (open `mint`, ≈8 USDC/yr for 5+ chars) — `--register` mints the shortfall itself.
Never persist `tokenId` (R3); subregistry/resolver stay zero until M2.1.

## Deploy town subregistry + PermissionedResolver (M2.1)

Deploys a `UserRegistry` proxy (town PermissionedRegistry) and a `PermissionedResolver` proxy via hackathon `VerifiableFactory`, then points `botanica.eth` at them with `ETHRegistry.setSubregistry/setResolver(labelhash, …)`. **Default is dry-run. Do not pass `--broadcast` until gate A.**

| Command (`pnpm --filter @agent-town/ens deploy-town-subregistry -- …`) | Broadcasts | Needs key |
| --- | --- | --- |
| *(no flag)* / `--dry-run` · live name status, factory salts, calldata, `eth_call` of `deployProxy` + `setSubregistry`/`setResolver` | no | no |
| `--broadcast` · TX: two `deployProxy` + `setSubregistry` + `setResolver`; writes `packages/ens/town.json` and prints `ENS_TOWN_REGISTRY` / `ENS_TOWN_RESOLVER` | yes | yes |

```bash
pnpm --filter @agent-town/ens deploy-town-subregistry -- --dry-run
# later, after gate A (Sepolia writes):
pnpm --filter @agent-town/ens deploy-town-subregistry -- --broadcast
```

Env: `SEPOLIA_RPC_URL` (read-only fallback: publicnode), `ENS_TREASURER_PRIVATE_KEY` (must own `botanica.eth`), `ENS_TOWN_NAME=botanica`.
Clients resolve via `UpgradableUniversalResolverProxy` (`deployments.json`). After broadcast, `getSubregistry("botanica")` returns the factory proxy. Never persist `tokenId` (R3); `town.json` stores addresses only.

## Mint 8 agent subnames (M2.3)

Mints `ada|bo|cy|dee|eli|fay|gus|hal.botanica.eth` via `TownRegistrar.register` (onlyOwner) and sets ARCHITECTURE §4.4 records: `addr(2152525650)`, `addr(60)`, `agent-context`, `town.role`, `avatar`. Does **not** set `town.credit-score`. **Default is dry-run.** `--broadcast` also requires `ALLOW_BROADCAST=true` (orchestrator after review).

| Command (`pnpm --filter @agent-town/ens mint-agent-names -- …`) | Broadcasts | Needs key |
| --- | --- | --- |
| *(no flag)* / `--dry-run` · grant + register + `setAddress`/`setText` calldata, `eth_call` sims, UniversalResolverV2 resolve plan | no | no |
| `--broadcast` · refused unless `ALLOW_BROADCAST=true`. Grants EAC, `register()` × 8, record multicall; re-reads tokenId via labelhash (printed only, R3) | yes | yes |

```bash
pnpm --filter @agent-town/ens mint-agent-names -- --dry-run
# after review (orchestrator; also deploy TownRegistrar first):
ALLOW_BROADCAST=true forge script script/DeployTownRegistrar.s.sol --rpc-url "$SEPOLIA_RPC_URL" --broadcast --evm-version paris
ALLOW_BROADCAST=true pnpm --filter @agent-town/ens mint-agent-names -- --broadcast
```

Foundry equivalent (same `ALLOW_BROADCAST` guard, paris):

```bash
cd packages/contracts
forge script script/MintAgentNames.s.sol --rpc-url "$SEPOLIA_RPC_URL" --evm-version paris
```

Env: `SEPOLIA_RPC_URL`, `ENS_TOWN_REGISTRY` / `ENS_TOWN_RESOLVER` (`town.json`), `ENS_TOWN_REGISTRAR` (after M2.2 deploy), `ENS_TREASURER_PRIVATE_KEY` (broadcast), `PUBLIC_APP_URL` (avatar origin; default `http://localhost:3000` so avatar is `{origin}/sprites/<name>.png` from the roster). Wallets: `packages/circle/roster.json`. Roles: `packages/shared` ROSTER. Resolve via `UpgradableUniversalResolverProxy` `0xd26f…f142`. Never persist `tokenId` (R3).

## Record alias `bank.botanica.eth` (M2.4)

Registers `bank.botanica.eth` via `TownRegistrar.register` (role Treasurer, owner = live ada name owner) then **`linkToNode(bank DNS, namehash(ada.botanica.eth))`** on the hackathon PermissionedResolver (impl `0xa9d3…614e`). That is a true inode record alias (`ROLE_LINK`), not an addr copy and not namechain `setAlias` (absent from bytecode). After broadcast, UniversalResolverV2 resolves `bank` identically to `ada` for `addr(2152525650)` and `addr(60)`. **Default is dry-run.** `--broadcast` also requires `ALLOW_BROADCAST=true`.

| Command (`pnpm --filter @agent-town/ens record-bank-alias -- …`) | Broadcasts | Needs key |
| --- | --- | --- |
| *(no flag)* / `--dry-run` · live ada resolve, register + `linkToNode` calldata, `eth_call` sims | no | no |
| `--broadcast` · refused unless `ALLOW_BROADCAST=true`. `register("bank")` if needed, then `linkToNode`; tokenId re-read via labelhash (printed only, R3) | yes | yes |

```bash
pnpm --filter @agent-town/ens record-bank-alias -- --dry-run
# after review (orchestrator; do not --broadcast in the PR):
ALLOW_BROADCAST=true pnpm --filter @agent-town/ens record-bank-alias -- --broadcast
```

Foundry equivalent (`ALLOW_BROADCAST` guard). Sepolia `eth_call` against hackathon proxies needs **cancun** (paris: `EvmError: NotActivated` on PUSH0). Never change `foundry.toml` default (paris is for Arc).

```bash
cd packages/contracts
forge script script/RecordBankAlias.s.sol --rpc-url "$SEPOLIA_RPC_URL" --evm-version cancun
```

Env: same as M2.3. `town.json` is not written (no new address). Never persist `tokenId` (R3). UR.resolve inner bytes may be ABI-encoded 20-byte addr (hex length 194) — decoded, not treated as empty.

## Typed client (M2.5)

`resolveAgent`, `setCreditScore`, `appendReview`, `revokeName` — names may be `ada` or `ada.botanica.eth`. Reads go through `UpgradableUniversalResolverProxy.resolve(dnsEncode, profile calldata)` (direct `addr(bytes,uint256)` on the proxy reverts). Writes re-read `getState(labelhash)` immediately before the tx and **never cache `tokenId`** (R3). Default is `simulateContract`; send requires `{ broadcast: true }` **and** `ALLOW_BROADCAST=true`.

```ts
import { createEnsClient, resolveAgent } from "@agent-town/ens";

const agent = await resolveAgent("ada");
// {
//   ensName: "ada.botanica.eth",
//   wallet: "0x97847b3C015994784Ae8Cf776ef9a4d563618cF2",   // Arc coinType 2152525650
//   wallet60: "0x97847b3C015994784Ae8Cf776ef9a4d563618cF2",
//   role: "treasurer",
//   avatar: "http://localhost:3000/sprites/ada.png",
//   agentContext: "# ada.botanica.eth\n...",
// }

const ens = createEnsClient({ publicClient, walletClient });
await ens.setCreditScore("ada", 80); // simulate
await ens.appendReview("bo", { by: "ada", tick: 3, score: 70, note: "repaid" });
await ens.revokeName("hal"); // unregister(live getState tokenId)
// ALLOW_BROADCAST=true required to actually send:
await ens.setCreditScore("ada", 80, { broadcast: true });
```

```bash
SEPOLIA_RPC_URL=$SEPOLIA_RPC_URL pnpm --filter @agent-town/ens test
pnpm --filter @agent-town/ens typecheck
```

Writes in unit tests are mocked / `eth_call` only — this package does not `--broadcast` from CI. `unregister(uint256)` selector `0xa02b161e` is pinned against UserRegistryImpl `0x47b4…2546`. Treasurer has `ROLE_UNREGISTER` on treasurer-minted names (`TREASURER_NAME_ROLES`); worker names are non-transferable — revoke is treasurer/registrar-side.

## ENS side-effects after repay / default (M4.6)

Treasurer-only writes (`ENS_TREASURER_PRIVATE_KEY`, never a worker wallet). `getState` is re-read inside the M2.5 client before every write; **tokenIds are never stored**. Default is simulate. `--broadcast` requires `ALLOW_BROADCAST=true` (orchestrator after merge — do not send live Sepolia txs from the PR).

| Event | ENS writes |
| --- | --- |
| **repay** | `town.credit-score` = clamp((current ?? **70**) + **5**, 0, 100); `appendReview` `{by:"ada", tick, score, note}` ≤200 chars (`repaid <amount> USDC, tick <n>`) |
| **1st default** | score **35** (PRD §12); review `defaulted on <amount> USDC, tick <n>` |
| **2nd default** (same name) | `revokeName` only (unregister live tokenId). Count defaults from existing `town.reviews` and/or `priorDefaults` |

Idempotent on ledger key `{agent}:{kind}:loan:{id}|tick:{tick}` — if a matching review is already on the name, no write. M4.3 Circle / sim should `import { applyLoanOutcome } from "@agent-town/ens"` after a real repay/`mark_default` (skipped/`--once` must not broadcast).

Live Arc (M1.6 `treasury-e2e`): merchant **bo** repaid loan #1 then defaulted loan #2 (0.2 USDC). PRD §12 demo worker is **fay**.

```bash
pnpm --filter @agent-town/ens ens-side-effects -- --dry-run \
  --agent fay --kind default --tick 7 --amount 1
# 2nd default (revoke):
pnpm --filter @agent-town/ens ens-side-effects -- --dry-run \
  --agent fay --kind default --tick 11 --amount 1 --prior-defaults 1
# after review (orchestrator only):
ALLOW_BROADCAST=true pnpm --filter @agent-town/ens ens-side-effects -- --broadcast \
  --agent fay --kind default --tick 7 --amount 1
```

```ts
import { applyLoanOutcome, planLoanOutcome } from "@agent-town/ens";

const plan = planLoanOutcome({ agent: "fay", kind: "default", tick: 7, amountUsdc: "1" });
// { action: "first-default", newScore: 35, review: { by: "ada", tick: 7, score: 35, note: "defaulted on 1 USDC, tick 7" }, revoke: false }

await applyLoanOutcome(
  { agent: "bo", kind: "repay", tick: 5, amountUsdc: "0.3", loanId: 1 },
  { publicClient, walletClient, account: treasurer },
); // simulate unless {broadcast:true} + ALLOW_BROADCAST=true
```

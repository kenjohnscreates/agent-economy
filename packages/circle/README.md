# @agent-town/circle

Circle Developer-Controlled **SCA** wallets on `ARC-TESTNET` — 8 agents + `mayor` — plus execute/transfer/poll helpers. No live calls without `--yes`.

**Setup order (human, once)**

1. [console.circle.com](https://console.circle.com) → Keys → Standard API key (Testnet) → `.env` `CIRCLE_API_KEY`.
2. Entity secret: `npx -p @circle-fin/developer-controlled-wallets node -e "require('@circle-fin/developer-controlled-wallets').generateEntitySecret()"` → `.env` `CIRCLE_ENTITY_SECRET`; **register** it in Console (Wallets → Configurator → Entity Secret; keep the recovery file offline). [Docs](https://developers.circle.com/wallets/dev-controlled/register-entity-secret).
3. `pnpm --filter @agent-town/circle setup-wallets --dry-run` → review plan → `… setup-wallets --yes`. Copy the printed `CIRCLE_WALLET_SET_ID` into `.env`; commit `roster.json`.
4. Fund wallets (M1.4): `pnpm --filter @agent-town/circle fund` (dry-run plan) → `… fund --yes`. Tries Circle faucet drip to `mayor`, else deployer EOA native-sends (18-dec) then Circle `transferUsdc` fan-out (6-dec) to 8 agents; treasurer `fund()` (or deployer `fund()` if Circle has no gas). Idempotent. Then `pnpm --filter @agent-town/circle balances`. Manual faucet: [faucet.circle.com](https://faucet.circle.com) (ARC-TESTNET).
5. ERC-8183 job e2e (M1.5): `pnpm --filter @agent-town/circle job-e2e` (dry-run 4-call plan: createJob → fund escrow → submit → complete). Orchestrator: `… job-e2e --yes`. Merchant `bo` → worker `dee`, 0.5 USDC (500000 base). Fund escrow expands live to provider `setBudget` + merchant USDC `approve` + `fund()` (reference contract). SCA `DEFAULT_FEE` MEDIUM; never `absoluteFee`.

**API** (all take an injected `CircleClient`; amounts are 6-dec USDC base-unit strings)
`createCircleClient(env)` · `ensureWalletSet(client, name, {walletSetId})` · `ensureRosterWallets(client, walletSetId, roster)` · `executeContract(client, {walletId, contractAddress, abiFunctionSignature, abiParameters, fee?})` · `transferUsdc(client, {walletId, to, amountUsdc})` · `waitComplete(client, txId, {timeoutMs, pollMs})` → tx or throws `CircleTxFailed`/`CircleTxTimeout` · `getTxHash` · `readRoster`/`walletFor` · `toUsdcDecimalString("3000000") → "3"` · `buildJobPlan` / `executeJobE2e` (ERC-8183).

**Gotchas**

- USDC ERC-20 `0x3600…` = **6 dec**; native gas balance = **18 dec**. Never mix (`src/amounts.ts`).
- Circle `amount` fields are _decimal_ strings (`"3.5"`), not base units — convert at the edge only.
- Arc SCA Circle txs need `feeLevel` (`DEFAULT_FEE` MEDIUM); `absoluteFee` is EOA/viem only (`maxFeePerGas` ≥ 20 gwei).
- SCA `txHash` appears only from `CONFIRMED`; poll with `waitComplete`, don't assume it at `SENT`.
- Re-running `setup-wallets --yes` is idempotent (roster.json → `listWallets(refId)` → create only missing).
- Re-running `fund --yes` is idempotent (skip wallets/treasury already at target). `--dry-run` is the default; refuses to broadcast without `--yes`.
- `job-e2e` defaults to dry-run; refuses to broadcast without `--yes`. Live path is orchestrator-gated.

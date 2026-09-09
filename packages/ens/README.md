# @agent-town/ens

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

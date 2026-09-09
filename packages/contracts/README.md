# @agent-town/contracts

Foundry package for Agent Town on Arc Testnet (chain id 5042002).

- Build: `forge build` · Test: `forge test -vv` · Lint: `forge fmt --check`
- `evm_version = "paris"`: Arc lacks PUSH0, so bytecode must not target shanghai+. Verify with `forge build --evm-version paris`.
- Reference constants (USDC `0x3600…0000`, 6 decimals; ERC-8183) live in `src/config/ArcConfig.sol`; production contracts take addresses via constructor.
- RPC endpoints read env vars: `ARC_RPC_URL`, `SEPOLIA_RPC_URL` (see `[rpc_endpoints]` in `foundry.toml`).

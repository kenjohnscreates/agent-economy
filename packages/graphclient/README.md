# @agent-town/graphclient

Town subgraph + live **Aave / Uniswap** rates (Signal C) so the bank prices off the real economy. Pitch: [root README](../../README.md).

Typed GraphQL client for the agent-town Studio subgraph plus Signal C external fetches.

Signal C (`fetchExternalSignals`) hits The Graph Network gateway for Aave V3 + Uniswap V3 IDs documented in `external.md`. Results are cached per tick with a 5s timeout and last-known stale fallback; wire into GET `/scoreboard` in M4.7.

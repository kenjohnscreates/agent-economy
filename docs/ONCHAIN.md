# On-chain proof (ETHOnline 2026)

Judges: **this is the verification page.** Every hash below is the full 66-character id. Truncated hashes (`0xde6b829e490267b8`) **do not resolve** on Arcscan.

Checked Sun 13 Sep 2026 against Arc RPC + [Arcscan (Blockscout)](https://testnet.arcscan.app) + Sepolia Etherscan. Receipts `status = success` / `0x1`.

Live app: https://agent-town-eight.vercel.app

---

## How to find a tx (read this first)

Two chains, on purpose.

| What | Chain | Explorer |
|---|---|---|
| USDC, loans, jobs, Circle wallets, Gateway mint | **Arc Testnet** `5042002` | https://testnet.arcscan.app |
| ENS names, registrar, credit-score text | **Sepolia** `11155111` | https://sepolia.etherscan.io |

**Paste the full hash** into that explorer’s search box. Do not search Arc for an ENS tx, or Sepolia for a USDC tx.

Circle **SCA** payments are **ERC-4337**. On Arcscan the top-level tx looks like:

- Method: `handleOps`
- `to`: EntryPoint `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` (not TownTreasury)
- `from`: a bundler EOA, not `ada` / `bo`

The town call is in **Logs** and **Token transfers** on that same hash. Fastest index: open [TownTreasury](https://testnet.arcscan.app/address/0xCE0ed3b88F60EefB8EA77D1daeC5cEE3a9e4FfC1) → **Logs**.

---

## Stacks we actually use

| Sponsor | Live artifact | Verify |
|---|---|---|
| **Arc + Circle** | TownTreasury, Arc USDC, ERC-8183 jobs, 9 SCA wallets, Gateway mint | tables below |
| **ENSv2** | `botanica.eth` subregistry + 8 roster names + visitor mint | Sepolia contracts + register txs |
| **The Graph** | Studio subgraph `agent-town` + Signal C (Aave V3 + Uniswap V3) | Studio / Explorer links |

Eight roster agents are **rule-bots** (Circle SCA + ENS), not LLM agents. LLM advisor/narrator default off. Deposits do **not** earn APR on-chain (30-day chat quote is illustrative). Replay is a recording. Gateway inbound is **already settled**.

Canonical JSON: [`packages/contracts/deployments/arc-testnet.json`](../packages/contracts/deployments/arc-testnet.json) · [`packages/circle/roster.json`](../packages/circle/roster.json) · [`packages/ens/town.json`](../packages/ens/town.json) · [`packages/circle/gateway-gus.json`](../packages/circle/gateway-gus.json)

---

## Contracts

### Arc Testnet

| | Address | Explorer |
|---|---|---|
| **TownTreasury** | `0xCE0ed3b88F60EefB8EA77D1daeC5cEE3a9e4FfC1` | [arcscan](https://testnet.arcscan.app/address/0xCE0ed3b88F60EefB8EA77D1daeC5cEE3a9e4FfC1) |
| **USDC (6 dec)** | `0x3600000000000000000000000000000000000000` | [arcscan](https://testnet.arcscan.app/address/0x3600000000000000000000000000000000000000) |
| **ERC-8183 jobs** | `0x0747EEf0706327138c69792bF28Cd525089e4583` | [arcscan](https://testnet.arcscan.app/address/0x0747EEf0706327138c69792bF28Cd525089e4583) |
| ERC-4337 EntryPoint 0.6 | `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` | [arcscan](https://testnet.arcscan.app/address/0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789) |
| Deploy (M1.2) | `0x8b37c5961810869c38573a9e61f8787515c718c5050877d870c7868ad0e10644` | [tx](https://testnet.arcscan.app/tx/0x8b37c5961810869c38573a9e61f8787515c718c5050877d870c7868ad0e10644) |

Gas is the **same USDC asset at 18 decimals**. Never a wrapped duplicate.

### ENS Sepolia (hackathon ENSv2)

| | Address | Explorer |
|---|---|---|
| Town registry (UserRegistry proxy) | `0xC4f5B3aa81390932398d23D736A965cA35de40f9` | [etherscan](https://sepolia.etherscan.io/address/0xC4f5B3aa81390932398d23D736A965cA35de40f9) |
| PermissionedResolver | `0x800d27e6e8497a57C273C53c86F2ec0713CEefc8` | [etherscan](https://sepolia.etherscan.io/address/0x800d27e6e8497a57C273C53c86F2ec0713CEefc8) |
| TownRegistrar | `0xe4A1Da7e9FDdcf074d9b344504C144b721Df0f7F` | [etherscan](https://sepolia.etherscan.io/address/0xe4A1Da7e9FDdcf074d9b344504C144b721Df0f7F) |
| UniversalResolverV2 proxy | `0xd26f2040d083af1cd2962ba303f4bea0c4faf142` | [etherscan](https://sepolia.etherscan.io/address/0xd26f2040d083af1cd2962ba303f4bea0c4faf142) |

Hackathon contract dump: [`packages/ens/deployments.json`](../packages/ens/deployments.json). Name UI: https://explorer.ens.dev/

### Circle + Graph

| | |
|---|---|
| Wallet set | `949545dc-5e02-5050-8e2f-7e6bc12bfed3` |
| Studio subgraph | https://thegraph.com/studio/subgraph/agent-town |
| Signal C — Aave V3 ETH | https://thegraph.com/explorer/subgraphs/JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk |
| Signal C — Uniswap V3 | https://thegraph.com/explorer/subgraphs/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV |

`SUBGRAPH_URL` stays in local `.env` — not in git.

---

## Wallets (Arc SCA)

| Name | Address | Arcscan |
|---|---|---|
| ada (treasurer) | `0x97847b3C015994784Ae8Cf776ef9a4d563618cF2` | [wallet](https://testnet.arcscan.app/address/0x97847b3C015994784Ae8Cf776ef9a4d563618cF2) |
| bo | `0x337512e3f78e9ad91493a98143b511c46c3775f7` | [wallet](https://testnet.arcscan.app/address/0x337512e3f78e9ad91493a98143b511c46c3775f7) |
| cy | `0xc0469ad2ee2acac0c9bd50e07481a5325f9c8950` | [wallet](https://testnet.arcscan.app/address/0xc0469ad2ee2acac0c9bd50e07481a5325f9c8950) |
| dee | `0x70b1300425c37af893ca4841e4183e7f0a1bdb89` | [wallet](https://testnet.arcscan.app/address/0x70b1300425c37af893ca4841e4183e7f0a1bdb89) |
| eli | `0x216ad8633cbcd6f63d6f79fcb5ae40bc5fe829dd` | [wallet](https://testnet.arcscan.app/address/0x216ad8633cbcd6f63d6f79fcb5ae40bc5fe829dd) |
| fay | `0xff7be88f27d518fdb80c8c7c9031894e21e37038` | [wallet](https://testnet.arcscan.app/address/0xff7be88f27d518fdb80c8c7c9031894e21e37038) |
| gus | `0x55911428be619c98220da9d6d9575d311d3082dc` | [wallet](https://testnet.arcscan.app/address/0x55911428be619c98220da9d6d9575d311d3082dc) |
| hal | `0x8214a5d688494e04c4a67c0b299706ec61dbc469` | [wallet](https://testnet.arcscan.app/address/0x8214a5d688494e04c4a67c0b299706ec61dbc469) |
| mayor | `0x52B9c05Db4866da39567A4F9F06Fac448EA30685` | [wallet](https://testnet.arcscan.app/address/0x52B9c05Db4866da39567A4F9F06Fac448EA30685) |
| ivy (visitor, do not film) | `0x0c97608d80018620345bd9722349682e584e4396` | [wallet](https://testnet.arcscan.app/address/0x0c97608d80018620345bd9722349682e584e4396) |
| owner EOA | `0xD428294070595052d9E0607f28CDf51b52156d2A` | [wallet](https://testnet.arcscan.app/address/0xD428294070595052d9E0607f28CDf51b52156d2A) |

ENS: `ada.botanica.eth` … `hal.botanica.eth`, `bank.botanica.eth` → ada, `ivy.botanica.eth` / `scout.ivy.botanica.eth`. CoinType **2152525650** (Arc) + `addr(60)`.

---

## Judge path (open these)

| Beat | Chain | Full hash | Explorer |
|---|---|---|---|
| TownTreasury deploy | Arc | `0x8b37c5961810869c38573a9e61f8787515c718c5050877d870c7868ad0e10644` | [tx](https://testnet.arcscan.app/tx/0x8b37c5961810869c38573a9e61f8787515c718c5050877d870c7868ad0e10644) |
| Job settle 0.5 USDC `bo`→`dee` (complete) | Arc | `0x32f6e22b40c83f170f92126b6a08487e9a7f2a79d993c1e4d8d751352120cdfb` | [tx](https://testnet.arcscan.app/tx/0x32f6e22b40c83f170f92126b6a08487e9a7f2a79d993c1e4d8d751352120cdfb) |
| **cy #9 Defaulted** | Arc | `0x8d19ced212882014f87be839b349257f9489c0832dafe7a5221d133950a8173d` | [tx](https://testnet.arcscan.app/tx/0x8d19ced212882014f87be839b349257f9489c0832dafe7a5221d133950a8173d) |
| **bo #10 Repaid** 1.2 USDC | Arc | `0x23c9a653cebdfe44a7bb5509e82a4a40f5820d85282ccc58ac38dec8ba038679` | [tx](https://testnet.arcscan.app/tx/0x23c9a653cebdfe44a7bb5509e82a4a40f5820d85282ccc58ac38dec8ba038679) |
| **#11 Pending cy** (request only — mayor Approve not broadcast yet) | Arc | `0xb5f69542641bd9f3a7503a16b3e656878793cf331c4fd28179bfd77e1d833d75` | [tx](https://testnet.arcscan.app/tx/0xb5f69542641bd9f3a7503a16b3e656878793cf331c4fd28179bfd77e1d833d75) |
| Gateway mint 0.80 USDC → treasury | Arc | `0x14fad3ea624b2343524282dabe26f35900b8e30b0f4e2021516b2cb523a5d3ea` | [tx](https://testnet.arcscan.app/tx/0x14fad3ea624b2343524282dabe26f35900b8e30b0f4e2021516b2cb523a5d3ea) |
| ivy deposit 1.50 USDC | Arc | `0xf7dbe2cddf6c000a67e2a6057713c443b0762b011a800948dd83d540c71be2b8` | [tx](https://testnet.arcscan.app/tx/0xf7dbe2cddf6c000a67e2a6057713c443b0762b011a800948dd83d540c71be2b8) |
| `botanica.eth` register | Sepolia | `0xb5f87ae2c3be83be65eef6970f95df89c6fdfcb95f9bd9ec3f8dd8f1ca962436` | [tx](https://sepolia.etherscan.io/tx/0xb5f87ae2c3be83be65eef6970f95df89c6fdfcb95f9bd9ec3f8dd8f1ca962436) |
| `ada.botanica.eth` register | Sepolia | `0x00cd606527bbdeeabb3c41d3474244264d1a9750d1477c28a353d509c41050fc` | [tx](https://sepolia.etherscan.io/tx/0x00cd606527bbdeeabb3c41d3474244264d1a9750d1477c28a353d509c41050fc) |

---

## Loan book (TownTreasury logs)

Statuses match the live API seed (`#11` still **Pending**).

| Id | Borrower | Status | Request | Approve / deny | Close |
|---|---|---|---|---|---|
| 1 | bo | repaid | [request](https://testnet.arcscan.app/tx/0x3e1b5819ccd9416c8df08e71ace9d34bf8103fa7e946f62f6509fe372adeee13) | [approve](https://testnet.arcscan.app/tx/0x4e460541a1dd9f985b1a7aae7649c2d837134fd3fc27ccc03ce19123ea200de3) | [repay](https://testnet.arcscan.app/tx/0x2fc2528dbda43f5ed489dce5c8a297e359ac666739abdcd0536f0ad002604eec) |
| 2 | bo | defaulted | [request](https://testnet.arcscan.app/tx/0x04a1ebc65f1d527fa52295ad899f69d39dbe5ff68f9becfa9efc44f2baaf61cc) | [approve](https://testnet.arcscan.app/tx/0x7b17a084d3a7a78b8b9cee64ace5f9963c4cfe877ba566f6e050d9a2e8cbe36c) | [default](https://testnet.arcscan.app/tx/0xc0b0575e8a91fa12795b5c024affbabeb8c2c5e71a559079d7f3533d7c78fa89) |
| 3 | bo | repaid | [request](https://testnet.arcscan.app/tx/0x7c05726486ffa0c1f9f7a6e38296214a990546b71547c5851de99ebce27c777e) | [approve](https://testnet.arcscan.app/tx/0xe8e1a171602cb1389216ad037f0337d8f2c8426ea31293bef01b2ea11467d1c7) | [repay](https://testnet.arcscan.app/tx/0xa5ca877759f40a43838d702dac897ece2d9ba3be654912479714f28c0c295ed6) |
| 4 | cy | repaid | [request](https://testnet.arcscan.app/tx/0x8b3b9e5cbf7e90282b7d85d78b11b5bcea5d7a77e121f325fe277cd216b87452) | [approve](https://testnet.arcscan.app/tx/0x8a54ea6826798cb743faef985806c8faff82a7a84617c644db7ddaa7fde6a0c5) | [repay](https://testnet.arcscan.app/tx/0x3b7e9d2ade6fbaf9058cdfbf456637e3dff07643d0e6d5261b3c9636855fe6ee) |
| 5 | bo | denied | [request](https://testnet.arcscan.app/tx/0x162b1ae0ba56dfabbf8b1ac68121bc26a5a0436f570d35dc137c74c7946df2d1) | [deny](https://testnet.arcscan.app/tx/0xcf81d98d5efaba4005094aeb41548f39dc5d0c8b4e9ac6eed892341a75f147c2) | — |
| 6 | cy | denied | [request](https://testnet.arcscan.app/tx/0x26e714efaef70f7eb943483e8eefd45602a39ffba2702bdc7927cb12912b9195) | [deny](https://testnet.arcscan.app/tx/0x55ff12b02040365361f4ca29103aff51ee34b0fc0c54a73915380b706efde6f3) | — |
| 7 | bo | repaid | [request](https://testnet.arcscan.app/tx/0x1a328e2bdf16b5f558eb89d7d60739ee240a7d865477194fe6144a78bb55fe39) | [approve](https://testnet.arcscan.app/tx/0x812f34960f0dae41821e3abbf74141127c27407ef34e1ffc1301d0a27a30dd5a) | [repay](https://testnet.arcscan.app/tx/0x6826bd4ac57a1acd1d7dee9fa934cab345f00757a797a89f1d64dcb255da39f0) |
| 8 | cy | repaid | [request](https://testnet.arcscan.app/tx/0x572f4917b92e46d64bec747e373508c2fe0ce0c3058a9542a1169272775791fe) | [approve](https://testnet.arcscan.app/tx/0x01d9de61cff4cd16fa5c1c11640fbf48c7528298e7486413c192239b3b9e5b68) | [repay](https://testnet.arcscan.app/tx/0x28b1ca744699966723623dd4ed5061c313854980ccb7b4a5eb541c9ed965f311) |
| **9** | **cy** | **defaulted** | [request](https://testnet.arcscan.app/tx/0xa0381220fc97bf0fd0acdeda62f84b1b0ea03bcfcb816d53335a2d9716faa6fb) | [approve](https://testnet.arcscan.app/tx/0x3421ad323c32381fcbd0815b0d44cc3904f2adea706bd5ef606edd3cc0ed6940) | [**default**](https://testnet.arcscan.app/tx/0x8d19ced212882014f87be839b349257f9489c0832dafe7a5221d133950a8173d) |
| **10** | **bo** | **repaid** | [request](https://testnet.arcscan.app/tx/0x09769e00cef25d8b054887ec463e92aec78108ba6a409bc676f018e2716258a5) | [approve](https://testnet.arcscan.app/tx/0xd1c45ff7a478d1330515d9205d2ee9d7ec2d3c851ce0471c11c716b0b8012375) | [**repay**](https://testnet.arcscan.app/tx/0x23c9a653cebdfe44a7bb5509e82a4a40f5820d85282ccc58ac38dec8ba038679) |
| **11** | **cy** | **pending** | [request](https://testnet.arcscan.app/tx/0xb5f69542641bd9f3a7503a16b3e656878793cf331c4fd28179bfd77e1d833d75) | *mayor click — not on chain yet* | — |

---

## Jobs (ERC-8183)

Canonical job **185726** `bo`→`dee` 0.5 USDC:

| Step | Hash |
|---|---|
| create | [0xe5067a4f…](https://testnet.arcscan.app/tx/0xe5067a4f899050ee85c4b4b35b98492a7e25413d4332b94eedb7cc30c7c677fb) |
| fund | [0x9afb88e8…](https://testnet.arcscan.app/tx/0x9afb88e869fa675417fff8543bc05f6156820277fe3f04d7eee043b916691608) |
| submit | [0x9e2f4529…](https://testnet.arcscan.app/tx/0x9e2f4529952e9996704ad744275d9c68827fa595f78211f7795ee072b349e2f4) |
| complete | [0x32f6e22b…](https://testnet.arcscan.app/tx/0x32f6e22b40c83f170f92126b6a08487e9a7f2a79d993c1e4d8d751352120cdfb) |

Later demo jobs **185764 / 185765**: [create 185764](https://testnet.arcscan.app/tx/0x2d10a247d3c341158654a4a323c0855be0cc858b78596d5478bea7e0075e2da8) · [create 185765](https://testnet.arcscan.app/tx/0x6c8a676a9233c60443d91535d3d608f31f9d1c214d31ffdcff0f4a3bc29c775b).

---

## Circle Gateway (gus Sepolia → Arc treasury)

Already settled. Not a live bridge in the film.

| Step | Chain | Hash |
|---|---|---|
| Approve Circle USDC | Sepolia | [0x5f9d349d…](https://sepolia.etherscan.io/tx/0x5f9d349d36d6fcd626747e41158d445042b54c566bee647361d97800385c6574) |
| Deposit 2 USDC into Gateway | Sepolia | [0x27c49e4d…](https://sepolia.etherscan.io/tx/0x27c49e4d9c0b4bb170ffdc3f7e04257b023ccec60d454df0d678392ac15dc54c) |
| Mint **0.80 USDC** to TownTreasury | Arc | [0x14fad3ea…](https://testnet.arcscan.app/tx/0x14fad3ea624b2343524282dabe26f35900b8e30b0f4e2021516b2cb523a5d3ea) |

- Sepolia USDC (Circle): `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` — **not** ENS MockUSDC
- GatewayWallet: `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`
- transferId `6969d69e-2f77-4f16-b7fa-e2aa8a7e4f21`

---

## Visitor (ivy) — proof only, do not film

| Step | Hash |
|---|---|
| `registerAgent` `ivy.botanica.eth` | [0x032db82b…](https://testnet.arcscan.app/tx/0x032db82b94edd8e62ea513b55b290a597a6055399492a4912bad2df16341a05e) |
| Fund 3 Arc USDC | [0xde6b829e…](https://testnet.arcscan.app/tx/0xde6b829e490267b84478e60663ca772561dc7b2654b423d60bd00d41bfd9f984) |
| Deposit **1.50 USDC** | [0xf7dbe2cd…](https://testnet.arcscan.app/tx/0xf7dbe2cddf6c000a67e2a6057713c443b0762b011a800948dd83d540c71be2b8) |

Film a **new** visitor name. Incognito / clear `localStorage`.

---

## ENS Sepolia (identity)

| Step | Hash |
|---|---|
| `botanica.eth` commit | [0x0efade58…](https://sepolia.etherscan.io/tx/0x0efade580a9b0d0f0d818a783f50e6c6f5c6c3edc6c45f6da4b70667b750af43) |
| mint | [0xaefb7966…](https://sepolia.etherscan.io/tx/0xaefb7966070ddde8980db9772ac3aa2135dc1bd0e395c52045ac69d0a50b7c8c) |
| approve | [0xe132b082…](https://sepolia.etherscan.io/tx/0xe132b082b24e3f2452a3c966810e728d422df2cc2aa9407f0d56631466f5a0d4) |
| register | [0xb5f87ae2…](https://sepolia.etherscan.io/tx/0xb5f87ae2c3be83be65eef6970f95df89c6fdfcb95f9bd9ec3f8dd8f1ca962436) |
| UserRegistry proxy | [0xb75e2030…](https://sepolia.etherscan.io/tx/0xb75e20305237826c585fb058b568dd81204bc3935ab1e130438239580aea9193) |
| PermissionedResolver | [0xeadefb91…](https://sepolia.etherscan.io/tx/0xeadefb91b2289b5472eaed6fa8ec762228c2384a491f8e1e209abce0bc0a3a3f) |
| setSubregistry | [0x7e4cc836…](https://sepolia.etherscan.io/tx/0x7e4cc83645583bb89ef4b1d5698707bb19e986f64e7f12532069a1ae692ff6f7) |
| setResolver | [0x0c251d58…](https://sepolia.etherscan.io/tx/0x0c251d58fbb6b0c5d172a7f8a8ca064b8b6bc9e966cdbabeffd86d45bddcc5ad) |
| TownRegistrar deploy | [0x7bc6d7a4…](https://sepolia.etherscan.io/tx/0x7bc6d7a41166048ed386c535ff3f964ff8d6aceddb0b1d06a010ee96d59fa782) |
| registry grant | [0xb768e384…](https://sepolia.etherscan.io/tx/0xb768e3840fa1f4c0eceecd01013a067178e417df390c3fd2ce07ea8247eb9547) |
| resolver grant | [0x7b2b4755…](https://sepolia.etherscan.io/tx/0x7b2b47550b23ba0326135ef5311a024978c3980028554667b363bd5fd06f47ec) |
| ada register | [0x00cd6065…](https://sepolia.etherscan.io/tx/0x00cd606527bbdeeabb3c41d3474244264d1a9750d1477c28a353d509c41050fc) |
| `bank.botanica.eth` register | [0x9c9f68c6…](https://sepolia.etherscan.io/tx/0x9c9f68c610f458c8769942d9cbb32da19795d0ccb9c8ebf0f9a1ddbd63be25a0) |
| bank `linkToNode` → ada | [0xa91aceb0…](https://sepolia.etherscan.io/tx/0xa91aceb0fba6ebb838495e50f446a0f14e73a593e7332f2d42bccaadeb7fec53) |
| bo credit-score 75 | [0x7ce503e7…](https://sepolia.etherscan.io/tx/0x7ce503e7741022cbb45ce6ea1958ed492e735aed43d434ba956dda4893f679d4) |
| bo review | [0xa404c6c1…](https://sepolia.etherscan.io/tx/0xa404c6c1fdb18dd0519f9d6e6e881bbdf058dc6f3794204649bae2394ec7c9c2) |
| fay credit-score 35 | [0xfd1782ad…](https://sepolia.etherscan.io/tx/0xfd1782adc413993619f4dbdedddc281076e2e406480f6d69dc7debb10f811e65) |
| fay review | [0xa606e5c2…](https://sepolia.etherscan.io/tx/0xa606e5c22e0031318cf3fc17f37b411c79fc013828692aceb2fb1ac8a05cf685) |

---

## More Arc money movement

Buys / stipends / extra funds live on the treasury [token-transfers](https://testnet.arcscan.app/address/0xCE0ed3b88F60EefB8EA77D1daeC5cEE3a9e4FfC1?tab=token_transfers) tab. Sample:

| | Hash |
|---|---|
| gus buy (M4.3) | [0xcaedb25f…](https://testnet.arcscan.app/tx/0xcaedb25ff8584590aa18878244ae3490006220f0e7bf492736f4f66875d3f755) |
| hal buy (M4.3) | [0x14af335c…](https://testnet.arcscan.app/tx/0x14af335c26ac608fe73720b138e030976ad9f10a34bbad4f8f72b02a8b261d6d) |
| ada `setBaseRateBps(700)` | [0xa4bcd8dd…](https://testnet.arcscan.app/tx/0xa4bcd8dd1098d3a7393ffc9eff5183137ae48be920cd83311f9370a235854496) |
| dee deposit 0.2 | [0x13c69835…](https://testnet.arcscan.app/tx/0x13c69835f005e36a5427f1ed9a82187bdd9dd3880cbff4e689df1a9d7620c711) |
| ada fund 3 USDC | [0x85030e4f…](https://testnet.arcscan.app/tx/0x85030e4f30e19a6d1aad3bb8c10f55e9121b34038f74b0d48b73cb2292160e9d) |
| `registerAgent` bo | [0xb0f06587…](https://testnet.arcscan.app/tx/0xb0f06587294bc4811afc8ff3fd52ac1f54dc67c622e1d7ac2901c8e83903cb00) |

---

## Honesty

- Loan **#11** is **Pending**. There is no Approve hash until the mayor click.
- Replay / mock / `/map-demo` are **not** live txs.
- Do not `markDefault` **bo** (2nd default → `revokeName`).
- Do not treat Graph Studio 429 as “the chain is fake” — last-good + this page are the book.

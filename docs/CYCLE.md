# Cycle script — what the bots do and say

Canonical 12-tick demo for **Dan (map/speech)** and **Kenny (sim/chain)**. Source of truth for speech + actions. Cinematic judge copy stays in [PRD §12](PRD.md#12-sample-demo-walkthrough-what-the-judge-sees).

Keyed by **tick number**, not the clock. Default cadence `TICK_MS=15000` → ~3 min. `STORYLINE=demo`.

| Mode | What you see | Speech |
|---|---|---|
| **Mock / `/map-demo` / replay** | Fixture story (`L-1`, `L-2`, `J-demo`, mayor `L-3`) | Rotating role lines below. Snapshot freeze = **tick 7 / default**. |
| **Live (`API_MODE=real`)** | Real Arc txs + subgraph ids (`#9`…`#11`) | Default **LLM narrator off**: `ada: Cautious town banker… (t7 default mark_default)`. All 8 agents get a row in Supabase each tick. Pixi chip = 3 s, ≤120 chars. |

**Sat 12 Sep film:** do **not** re-run `--ticks 12 --yes` until mayor uses **#11**. Cut to arcscan for beats already landed. Speech/feed stay blank until this Supabase ledger has rows.

---

## Cast

Town **`botanica`**. Names resolve on Sepolia → Arc wallets.

| Agent | Role | Home | Persona (also the live bubble stem) |
|---|---|---|---|
| **ada** | treasurer | Bank | Cautious town banker who prices risk and never lends blind. |
| **bo** | merchant | Market | Upbeat shopkeeper who restocks fast and borrows when the till runs dry. |
| **cy** | merchant | Market | Thrifty trader who watches DEX volume before setting prices. |
| **dee** | worker | Workshop | Reliable craftsperson who saves a fifth of every payout. |
| **eli** | worker | Workshop | Ambitious builder who bids on the best-paying job first. |
| **fay** | worker | Workshop | Easygoing artisan who sometimes forgets a loan is due. |
| **gus** | consumer | Homes | Cheerful regular who shops whenever the wallet allows. |
| **hal** | consumer | Homes | Frugal retiree living on the town stipend and small treats. |
| **you** | mayor | — | One click: Approve/Deny a **flagged** loan. Live = **#11 cy**. Mock = **L-3**. |

---

## Every tick (backend)

1. Pull **subgraph** (loans, jobs, treasury, GDP) + **Signal C** (Aave V3 USDC borrow APY, Uni V3 DEX volume). Cache 1 tick; `stale=true` if fetch fails.
2. `decide()` per agent (pure rules). Storyline `prepare` may overlay fixtures in **dry-run only**.
3. Execute via **Circle SCA** on Arc (live) or skip with `skipped` (dry-run).
4. Persist `ticks` / `actions` / `narration` to **Supabase**. API SSE: `tick` → `tx` → `narration` → `loan_flagged` → `scoreboard`.
5. **Stipend** ticks 3, 6, 9, 12: ada `pay_stipend` **0.5 USDC** to consumers (`STIPEND_EVERY_TICKS=3`).
6. Merchant **price** drifts with Uni volume. Town **rate** = market APY + **200 bps** spread + **200 bps** if `defaults > 0`.

Code: `packages/shared/src/storyline.ts`, `apps/sim/src/storyline-hooks.ts`, `apps/sim/src/decide.ts`, `apps/sim/src/narrator.ts`.

---

## Mock / replay speech (what Dan films in rehearsal)

Mock picks **1–3 agents per tick** from these pools (`apps/api/src/mock/store.ts`). `/map-demo` starts on the tick-7 fixture lines.

| Role | Lines (rotate) |
|---|---|
| treasurer | “Books balanced; watching utilisation.” · “Market rate moved — nudging our spread to match.” · “One flagged loan on the desk. Mayor, your call.” |
| merchant | “Shelves are thin again — hiring!” · “DEX volume is up, nudging prices a touch.” · “Good week. Might pay that loan down early.” |
| worker | “Another job done, another coin in the bank.” · “Best-paying job on the board — mine.” · “Delivering tomorrow; deposit goes straight to the bank.” |
| consumer | “Prices are a bit steeper today, still worth it.” · “Waiting for next stipend before shopping.” · “Stipend landed — off to the market.” |

**Fixture snapshot (tick 7)** — hero bubbles on `/map-demo` until replay advances:

| Agent | lastDecision | Say |
|---|---|---|
| ada | mark_default fay `L-2`; rate → 8.1% | “Grace period is over. Rates go up until the books balance.” |
| bo | post_job `J-2` 1.2 USDC | “Shelves are thin again — hiring!” |
| cy | idle (stock ok) | “DEX volume is up, nudging prices a touch.” |
| dee | deposit 20% of job pay | “Another job done, another coin in the bank.” |
| eli | accept_job highest pay | “Best-paying job on the board — mine.” |
| fay | idle; loan defaulted | “…maybe I should have paid that back.” |
| gus | buy from bo | “Prices are a bit steeper today, still worth it.” |
| hal | idle; waiting stipend | “Waiting for next stipend before shopping.” |

---

## 12-tick cycle (demo storyline)

Phases: **1–3 boom** · **4–5 borrow** · **6–8 default** · **9–10 hike** (mayor) · **11–12 recover**.

### Ticks 1–3 — boom (~0:00–0:45)

Town wakes. Consumers shop. Merchants hire. A worker delivers and saves.

| t | Phase | On screen (do) | Say (intent) |
|---|---|---|---|
| **1** | boom | **gus** + **hal** buy at Market (USDC → **bo**). **bo**/**cy** post a restock job if stock &lt; 2. **dee** accepts funded job. | gus/hal shopping; bo “hiring!”; dee “mine.” |
| **2** | boom | **dee** **deliver** (after 1 tick). More buys. | dee “delivering / coin in the bank.” |
| **3** | boom | **bo** **complete_job** (escrow → dee). **dee** **deposit** 20%. **ada** **pay_stipend**. | dee deposit line; hal “stipend landed.” |

- **BE:** `buy` = Circle ERC-20 transfer. `post_job` + `fund_escrow` = ERC-8183 create/fund (`0x0747…`). `accept_job` / `deliver` / `complete_job` = setProvider / submit / complete. Live skips fixture ids `J-demo` / `L-1`. Deliver only if job still **funded** (re-submit reverts — `bc6e112`). `deposit` = TownTreasury. Subgraph indexes within seconds → scoreboard GDP.
- **Live already:** buys, post_job, some dee deliver, stipends on the M6.5 run.

### Ticks 4–5 — borrow (~0:45–1:15)

Merchant is cash-poor after payroll → asks the bank.

| t | Phase | On screen (do) | Say (intent) |
|---|---|---|---|
| **4** | borrow | **bo** **request_loan** (~1.2 USDC) if not already pending. Storyline **forces** this if rules didn’t. | bo “till ran dry.” ada watching utilisation. |
| **5** | borrow | **ada** **approve_loan** if score ≥ 60 and util &lt; 80% (rules; LLM advisor explains, cannot exceed cap). USDC Treasury → bo. Else **flag** (stays pending → mayor). | ada “books balanced” / advisor text in Bank panel. |

- **BE:** `requestLoan` / `approveLoan` on TownTreasury. Advisor = optional LLM; default **rules**. Dry-run overlays fixture `L-1` 3 USDC for bo. Live M6.5: t2 ada approved **#10 bo** (not t4). Do not expect a second auto-approve of **#11** — that’s the mayor beat.
- **UI:** Bank panel shows reasoning + rate stack (market + 2% spread [+ 2% default premium]).

### Ticks 6–8 — default (~1:15–2:00)

A borrower misses the window. Treasurer marks default, writes ENS, prices the hike.

| t | Phase | On screen (do) | Say (intent) |
|---|---|---|---|
| **6** | default | Grace ticking. fay (mock) / **cy** (live seed) does **not** repay. | fay “…maybe I should have paid that back.” |
| **7** | default | **ada** **mark_default**. Scoreboard defaults +1. Storyline **forces** this once. | ada “Grace period is over. Rates go up…” |
| **8** | default | ENS catch-up visible on hover: score **35**, review “defaulted on …”. | fay sulk; others feel the rate. |

- **BE:** Loan due = `approvedAt + 4` ticks, default at `due + 2` grace — **or** live seed used term **1s** so t7 could fire on dirty chain. `markDefault` on Treasury. Then ada `setCreditScore` + `appendReview` on Sepolia (treasurer-only EAC). **Never** `markDefault` **bo** (2nd default → `revokeName`). Mock defaulter = **fay** `L-2`. Live defaulter = **cy #9**.
- **UI:** Bank pulse on `mark_default`. Hover cy/fay → ENS explorer.

### Ticks 9–10 — hike + mayor (~2:00–2:30)

Rate stacks on the real market APY. **You** approve the flagged loan.

| t | Phase | On screen (do) | Say (intent) |
|---|---|---|---|
| **9** | hike | **ada** **set_rate** (market + spread + default premium). **bo** **repay** if an Active bo loan exists (held until t9 on live). | ada “market rate moved”; bo “pay that loan down.” |
| **10** | hike | Flagged loan sits in Mayor panel. **You click Approve.** | ada “One flagged loan on the desk. Mayor, your call.” |

- **BE:** `setBaseRate(bps)` on Treasury. `repay` Circle → contract. Flag = rules `score < 60` **or** util ≥ 80% → **no** `approve_loan` (loan stays `pending`). Mock overlay: **eli** `L-flag` score 50. Live: **#11 Pending cy** (seeded after the 12-tick; ada would auto-approve if you run another 12-tick — don’t). Mayor POST `/mayor/loan-decision` needs `ALLOW_BROADCAST=true`; toast hash must be arcscan.
- **UI:** Mayor queue shows **numeric id** on live, not `L-3`. Feed: `approve_loan` + coin to borrower.

### Ticks 11–12 — recover (~2:30–3:00)

Town keeps shopping. Cut to architecture.

| t | Phase | On screen (do) | Say (intent) |
|---|---|---|---|
| **11** | recover | Buys / jobs / stipend continue. GDP from subgraph. | gus shopping; ada watching books. |
| **12** | recover | Last stipend. Hold on scoreboard + architecture slide. | “Books balanced.” |

- **BE:** No extra storyline force. Live treasury ~2.2 USDC after M6.5 stipends; deposits 0.92; rate **829** bps after #9.
- **Slide:** ENS Sepolia names → Arc USDC + TownTreasury `0xCE0e…FfC1` → Studio `agent-town` → Signal C Aave/Uni → you’re the mayor.

---

## Live book vs this script (Sat film)

| Beat | Script (clean / mock) | On chain now |
|---|---|---|
| Boom buys + jobs | t1–3 gus/hal/dee | Landed on M6.5 12-tick |
| Merchant borrow | t4 bo `L-1` | **#10 bo** repaid (ada approved t2 of that run) |
| Worker default | t7 fay `L-2` | **#9 cy Defaulted** (seed 0.2 USDC, term 1s) |
| Rate hike | t9 ada `set_rate` | Landed (~829 bps) |
| Merchant repay | t9 bo `L-1` | **#10 Repaid** |
| Mayor click | t10 eli `L-flag` / mock `L-3` | **#11 Pending cy** — **this is the live click** |

---

## Dan checklist (speech chrome)

- Chip above sprite, Forest/Sprout, 3 s, wrap ~24 cols, clamp to 640×360, emote pop on `narration` change.
- Overlap: 8 chips at once on **live** (sim writes all roster). Mock only 1–3/tick.
- Empty `narration` = hide chip. Live ledger currently **0 rows** → no chips until sim writes this project.
- Do not change `MapSlotProps` / `ZONES` / `zonePoint`. `/map-demo` = rehearsal only.

## Kenny checklist (don’t break the film)

- Do not `--ticks 12 --yes` until mayor uses **#11**.
- Do not `markDefault` bo / `revokeName`.
- `LLM_NARRATOR` off → static persona lines; turn on only if you want prettier live bubbles (Gate-ish; not required).
- Gateway (gus Sepolia USDC) is a Fri extra, not a tick in this cycle.

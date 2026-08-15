# UI Proposal — Tamoa web surface

> **The rule this page exists to enforce:** exactly **one screen carries real data** — the
> monthly report. Everything else is *chrome*: it exists to say "this is a finance
> controlling product for SMEs, not a chat demo", and it is allowed to do nothing.

Script: [imessage_flow.md](./imessage_flow.md) · Phase 1 subset:
[imessage_flow_phase1.md](./imessage_flow_phase1.md) · Demo arc:
[product_demo.md](./product_demo.md) · Prior UI thinking: [ux_replay.md](./ux_replay.md)

**Naming:** **Tamoa** = product · **Tammy** = the agent in iMessage.

**Cadence note.** Every doc in this repo is **monthly** (books settle ~10 days after month
end; comparisons are month-over-month against a trailing 12). This page is written monthly.
If the demo really is switching to weekly, it changes copy and the comparison strip — not
the layout — but say so before build, because `TrailingMonths` (report 6) is the whole
comparison story.

---

## 1. What this UI is, in one paragraph

iMessage is the product. This page is the **shared brief** the owner and the human
fractional CFO both open when the call is booked — same URL, same facts. We are now
proposing it live inside an **app shell**: a persistent left sidebar of finance-controlling
modules, of which exactly one is real. The shell costs a few hours and buys the thing the
brief alone can't show: that Tammy is one surface of a controlling product, not a
one-trick text bot.

---

## 2. The two-layer rule

| Layer | What it is | Data | Interactive? |
|---|---|---|---|
| **Live layer** | Monthly Report (the shared brief) | Real Odoo, via the same `AnswerResult` path as the thread | Yes — Book, Pay, and the report itself |
| **Signal layer** | Sidebar modules, company switcher, period picker, avatar | **None** | No — visibly inert |

### Guardrail: the signal layer must never show a number

This is not a style preference. The entire product claim — repeated in
[imessage_flow.md](./imessage_flow.md) and enforced token-by-token in the Phase 1
placeholder table — is **Tammy never invents a figure**. A judge who clicks *Cash Flow* and
finds a plausible-looking chart has just watched us invent figures in our own UI. One click
undoes the grounding story.

So inert modules resolve to one of exactly three states, and never to fake data:

| State | Looks like | Use for |
|---|---|---|
| **Locked** | Item greyed, small lock glyph, tooltip `Available on your plan from Q4` | Most modules — cheapest, reads as a real product with tiers |
| **Empty** | Module opens, real chrome, centred line: `Nothing to show yet — Tamoa reads this from your Odoo on the next close.` | 1–2 modules, to prove the shell is real and routes |
| **Skeleton** | Module opens, grey placeholder bars, no digits, `Preparing…` | At most one — use sparingly, it reads as broken if overused |

No lorem numbers. No demo charts. No "$47,392" anywhere that isn't from the book.

---

## 3. Sidebar — the module list

The menu is the pitch. It should read like the table of contents of a controlling suite an
SME would actually pay for, in the order a finance person thinks:

```
TAMOA
Northwind Coffee Co.  ▾        ← company switcher (inert, one company)

── THIS MONTH ──────────────
▸ Monthly Report        ● LIVE   ← the only real screen
  Cash Flow             🔒
  Receivables           🔒
  Payables              🔒

── CONTROL ─────────────────
  Expenses & Categories 🔒
  Budget vs Actual      🔒
  Scenarios & Runway    🔒
  Tax Position          🔒

── PEOPLE ──────────────────
  Expert Calls          ○ empty
  Documents             🔒

── SETUP ───────────────────
  Odoo Connection       ○ empty  ← shows "Connected · read-only"
  Team & Alerts         🔒
  Settings              🔒
```

Two deliberate choices:

- **Odoo Connection is an *empty* module, not locked.** It's worth one click: it renders
  `Odoo · Connected · read-only` and nothing else. That single line does more for the
  "not a Claude wrapper" argument than any chart, and it's honest — read-only forever is a
  product rule ([product_demo.md](./product_demo.md#explicitly-out-of-scope-for-v1-demo)).
- **Expert Calls is empty, not locked**, because the demo books one. If time allows, it
  lists the one booked call. If not, empty state.

Everything else: locked. Locked is faster to build than empty and reads better than broken.

---

## 4. The live screen — Monthly Report

One scroll, five blocks, in this order. Blocks 1–3 are the iMessage report rendered for a
screen; blocks 4–5 are what the *call* needs.

```
┌──────────────────────────────────────────────────────────────────────┐
│  July 2026            [ ◂ Jun ]  [ Jul ▾ ]  [ Aug ▸ ]     ⬤ Settled  │  ← period picker inert
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1 — THE MONTH                                                       │
│  ┌────────────┬────────────┬────────────┬────────────┐               │
│  │ Revenue    │ Net        │ Cash 31 Jul│ Runway     │               │
│  │ $[REVENUE] │ $[NET]     │ $[CASH]    │ ~[RUNWAY]m │               │
│  │ ▲[REV_Δ]%  │            │            │ at 3-mo burn│              │
│  └────────────┴────────────┴────────────┴────────────┘               │
│                                                                      │
│  2 — WATCHING                                                        │
│  ⚠  [TOP_RISK]                                                       │
│     e.g. "Acme was 41% of July revenue"                              │
│                                                                      │
│  3 — AGAINST THE LAST 12 MONTHS                                      │
│  [COST_CATEGORY]     $[AMOUNT]   vs $[AVG] avg   ▲ high              │
│  [UNEXPECTED_ITEM]   $[AFTER]    vs $[AVG] avg   ⚑ one-off?          │
│  [TREND_ITEM]        $[M1]→$[M2]→$[M3]           ▲ 3 months running  │
│                                                                      │
│  4 — THE CONVERSATION                                                │
│  Tammy said:  "…first take, pre-review…"                             │
│  Owner asked: "Can we afford a mid-level engineer?"                  │
│  ── after expert review ──────────────────                           │
│  ✎ [UPDATED_TAKE]                              [ before | after ⇄ ]  │
│                                                                      │
│  5 — THE CALL                                                        │
│  Decide: hire next month — yes / no / wait                           │
│  [  Book 20 min  ]   [  Pay $[PRICE]  ]                              │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│  July 2026 · [N] documents · as of 31 Jul 2026 · read-only from Odoo │  ← provenance footer
└──────────────────────────────────────────────────────────────────────┘
```

### Block-by-block intent

| # | Block | Why it's on the page |
|---|---|---|
| 1 | The month | Same four figures as beat 1 of the thread. Screen-native, not a chat bubble. |
| 2 | Watching | One risk, one line. Matches `[TOP_RISK]`'s three grounded shapes — never more than one. |
| 3 | Against the last 12 | **The block that justifies a screen.** A month's figure invites the wrong reaction; the same figure beside its trailing average is a finding. Hard to do in a bubble, natural in a table. |
| 4 | The conversation | The Terac before → after, made visible in ~2 seconds instead of scrolling a thread. The `⇄` toggle is the 10-second hackathon beat. |
| 5 | The call | Book + Pay, same Cal.com and Stripe links as the thread. One suggested decision line. |
| — | Footer | The provenance line from `AnswerResult`. It is the anti-hallucination claim, printed. |

### What is *not* on this screen

No multi-company switcher that switches. No CFO-private notes. No editable fields on any
figure. Every minute here is a minute off the thread, which is the actual demo
([product_demo.md](./product_demo.md#build-to-demo-checklist-priority-order)).

> **One deviation, as built.** This section originally said *no charts, no sparklines*. The
> built page carries exactly one: a thirteen-month strip of revenue and net, straight off
> report 6. The reasoning that ruled charts out was "we'd have to invent an axis" — and for
> this series we don't. It is two rows of `div`s scaled to the largest value in each row,
> zero-based, no library. The revenue row comes out almost flat and the net row falls off a
> cliff into red, which *is* the month's story and is the one thing hard to say in a bubble.
> The rule it does not break: no second chart, and nothing drawn that isn't in the book.

---

## 5. Data binding — every element to a source

Same test as the Phase 1 token table: **an element with no report number is a number we'd
have to invent, so it doesn't ship.**

| UI element | Token | Source | Report |
|---|---|---|---|
| Revenue tile | `[REVENUE]` | ProfitAndLoss | 5 |
| Revenue delta | `[REV_DELTA]` | TrailingMonths | 6 |
| Net tile | `[NET]` | ProfitAndLoss | 5 |
| Cash tile | `[CASH]` | CashPosition, at month end | 9 |
| Runway tile | `[RUNWAY]` | `RunwayEstimator` (cash ÷ trailing burn) | 6 + 9 |
| Watching line | `[TOP_RISK]` | PartnerRevenue / aging / trend | 13, 3, 6 |
| Comparison rows | `[COST_CATEGORY]`, `[AMOUNT]`, `[AVG]`, `[M1..M3]` | TrialBalance + TrailingMonths | 7, 6 |
| Settled badge | settling flag | `AnswerResult` | — |
| Footer | `[N] documents`, `as of` | `AnswerResult` → presenter | — |
| Before / after | agent take + expert edit | Terac feedback path | — |
| Book / Pay | Cal.com, Stripe links | Demo config | — |

**Reuse, don't re-fetch.** This page renders the same `AnswerResult` the thread presenter
already produces — a second presenter over the same use case, not a second data path. If
building it means touching `application/` or `domain/`, the design is wrong.

### Failure states are part of the design

The thread already has copy for a partial book
([imessage_flow_phase1.md](./imessage_flow_phase1.md)). The page needs the visual
equivalent, or it will silently render a blank tile and look broken on camera:

- A report that failed → that tile shows `—` plus `couldn't read` on hover; the footer
  carries the `⚠️ couldn't read: …` line.
- A month before the ledger starts → whole page becomes one line, not empty blocks.

---

## 6. How it plays in the 2-minute demo

The web surface is still the **optional last beat** — it must not eat the thread
([product_demo.md](./product_demo.md#2-minute-arc-high-level-not-a-script)). Budget: 15
seconds, and it earns them like this:

| Seconds | Action | Line to say |
|---|---|---|
| 0–4 | Open the brief URL from the thread | "This is what the owner and the CFO open on the call." |
| 4–8 | Cursor drifts down the sidebar — never clicks | "Same numbers, plus the rest of the controlling surface." |
| 8–13 | Hit the `before ⇄ after` toggle | "Expert feedback, folded back in." |
| 13–15 | Point at the footer | "Every figure, read-only out of Odoo." |

**The sidebar is scenery, not a stop.** Its whole job is to be *seen in peripheral vision*
while the cursor is going somewhere else. Do not click a locked item on camera — a tooltip
is a much worse frame than a moving cursor. If a judge clicks one later, the lock glyph has
already told the truth: it's a product with modules, and this one isn't turned on.

---

## 7. Build scope

| | Item | Status |
|---|---|---|
| ✅ | App shell + sidebar, all locked states | Built |
| ✅ | Monthly Report blocks 1–3 from the real book | Built |
| ✅ | Block 5 Book + Pay (same links as thread) | Built, links from env |
| ✅ | Provenance footer + failure states | Built |
| ✅ | Block 4 before ⇄ after toggle | Built, **with a working write path** |
| ✅ | Odoo Connection + Expert Calls empty modules | Built |
| ➕ | Thirteen-month revenue/net strip | Added — see the deviation note in §4 |
| ➕ | Light / dark theme | Added; costs one token block, demos well |
| ❌ | A second chart | Out |
| ❌ | Working period picker / company switcher | Out (inert chrome, toasts when pressed) |
| ❌ | Auth, multi-tenant, CFO-private notes | Out |

**Do not start any of this until the thread works end to end with real numbers.** The build
order in [product_demo.md](./product_demo.md) puts the web surface last, behind the Linq
human touch, and this proposal doesn't change that ranking — it just makes the last item
worth more when we get to it.

---

## 8. As built

Shipped and running. `npm run brief` → <http://localhost:3000>.

### Where it lives

| Layer | File | What it owns |
|---|---|---|
| `domain/` | `model/WatchItem.ts`, `model/CostSignal.ts` | The findings, as values — fields, not sentences |
| `domain/` | `services/HighlightSelector.ts` | **Which** risk and which cost lines. Pure, thresholds injectable |
| `domain/` | `model/ReviewNote.ts` | The expert's before → after |
| `application/` | `usecases/BuildMonthlyReport.ts` | Same book, same repository, same cache as the thread |
| `application/` | `dto/MonthlyReportResult.ts` | Flattened out of the book, like `AnswerResult` |
| `application/` | `ports/driven/ReviewNotes.ts` | The one write port — and it writes to us, never to Odoo |
| `presentation/` | `presenters/MonthlyReportPresenter.ts` | Every string. Owns tone, owns nothing else |
| `adapters/inbound/web/` | `BriefController.ts`, `StaticFiles.ts` | HTTP in, view model out; traversal guard |
| `adapters/outbound/review/` | `InMemoryReviewNotes.ts` | A `Map`. Notes do not survive a restart, on purpose |
| `web/` | `index.html`, `styles.css`, `app.js` | No framework, no build step, no `node_modules` in the browser |

### Routes

| Route | Purpose |
|---|---|
| `GET /` | The page |
| `GET /api/brief?client=&month=` | The view model. `client` must be one we serve — a 404 otherwise, so the parameter cannot enumerate an Odoo database |
| `POST /api/brief/review?client=&month=` | `{ before, after, author? }`. Both halves required |
| `GET /api/settings` | Booking link, payment link, price. Deliberately **not** on the brief payload, so "every figure traces to a report" stays literally true |
| `GET /health` | Unchanged, plus whether messaging is configured |

### Three things worth knowing

- **The page boots with no credentials.** `buildBriefContainer()` wires the ledger and
  nothing else; `buildContainer()` adds Claude and Linq on top. If their keys are missing the
  server says so loudly, serves the brief anyway, and answers the Linq webhook with 503.
  With `USE_FIXTURES=true` it needs no Odoo either.
- **The browser formats nothing.** Every figure crosses the wire already rendered by
  `MoneyFormatter`, so the page and the text message round the same number the same way and
  there is no second currency table in JavaScript to drift from the first.
- **The before → after is real, not staged.** "Record expert review" posts to the server and
  the block re-renders from stored data. With no note, it shows an empty state — it never
  relabels the agent's own take as reviewed.

Tests: `tests/domain/HighlightSelector.test.ts`,
`tests/presentation/MonthlyReportPresenter.test.ts`, `tests/adapters/inbound/web/`.
The one to keep green if you change the thresholds is *"calls an annual bill a one-off, not a
spike"*.

---

## 9. Open questions

- **Weekly or monthly?** Everything downstream (`TrailingMonths`, the "against the last 12"
  block, the settled badge) assumes monthly. Confirm before build.
- **One URL or per-month URLs?** Suggest one URL, latest settled month — no routing.
- **Does the sidebar survive on a phone?** The owner may open the link from iMessage on
  their phone. Proposal: below `sm`, sidebar collapses to a hamburger and the report is the
  page. The "full product" signal is for the laptop screen-share; the phone just needs the
  brief.
- **Locked tooltip copy** — `Available on your plan from Q4` implies pricing tiers we
  haven't decided. Alternative: `Coming soon`. Cheaper, less of a claim, slightly less
  convincing.

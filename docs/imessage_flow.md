# iMessage flow — Tammy / Tamoa (script)

Exact thread we want on camera. Numbers in `[brackets]` come from Odoo at runtime —
never invent them.

**Naming:** **Tamoa** = the product · **Tammy** = the agent (what the owner texts)

High-level demo: [product_demo.md](./product_demo.md) · Feedback accepted from
[feedback_product_demo.md](./feedback_product_demo.md) (Entry 1 full, Entry 2 partial,
Entry 3 full — polish after basic flow).

**Actors:** **Tammy** = agent · **Owner** = demo participant playing the company

---

## Beat map

| # | Beat | Who | Purpose |
|---|---|---|---|
| 1 | Weekly report | Tammy | Agent texts first |
| 2 | Thanks + 👍 | Owner → Tammy | Human touch (Entry 3 — after basic flow works) |
| 3 | Dig-in 1 | Owner → Tammy | Prove ledger knowledge |
| 4 | Dig-in 1 answer | Tammy | Odoo-backed |
| 5 | Dig-in 2 | Owner → Tammy | Second (max) interaction |
| 6 | Dig-in 2 answer | Tammy | Odoo-backed |
| 7 | Hard question | Owner | Hiring / cash flow / raise — needs human CFO |
| 8 | Prep ask | Tammy | Hire profile for the brief |
| 9 | Profile | Owner | Prep input |
| 10 | Book + brief link | Tammy | Cal.com + graphical brief (Entry 2 partial) |
| 11 | Pay | Tammy | Stripe |
| 12 | Before → after | Tammy | Updated take after human feedback (hackathon) |

**Linq polish (Entry 3)** on every owner message once wired: mark **read** → show
**typing** → then send. Higher priority than Replay / web polish; do **after** beats
1 + 3–11 work with real numbers and links.

---

## Script

### 1 — Tammy: weekly report

```
Hey — it’s Tammy, your fractional CFO from Tamoa. Quick weekly check-in.

Cash: about $[CASH]
Runway: ~[RUNWAY] months
Watching this week: [TOP_RISK]

Want me to dig into anything in the books, or are you thinking about a bigger call
(hiring, raise, big spend)?
```

### 2 — Owner: thanks → Tammy reaction (Entry 3)

```
Owner: Thanks
```

**Linq:** Tammy 👍 tapback on “Thanks”.

### 3 — Owner: dig-in 1

```
Owner: What’s my main cost category right now?
```

**Linq:** read + typing, then reply.

### 4 — Tammy: dig-in 1 answer

```
Your largest cost category this period is [COST_CATEGORY] at about $[AMOUNT]
([PCT]% of expenses).

Biggest line inside that: [LINE_ITEM] (~$[LINE_AMOUNT]).
```

### 5 — Owner: dig-in 2

```
Owner: Anything unexpected vs the last few weeks?
```

### 6 — Tammy: dig-in 2 answer

```
Yes — compared with the prior weeks:

• [UNEXPECTED_ITEM] is up ~[DELTA]% (was ~$[BEFORE], now ~$[AFTER])
• Everything else is roughly in line

Nothing else jumps out as unusual in the ledger.
```

*(If nothing is unusual, say that plainly — still grounded in Odoo.)*

### 7 — Owner: hard question (needs human)

```
Owner: I’m thinking about hiring someone to help build the product. I don’t fully
get how that hits cash flow — can we afford it, or do we need to raise?
```

### 8 — Tammy: prep, then offer CFO

**Primary (use this):**

```
I can sketch the cash math from your books (runway vs a ~$[MONTHLY]/mo hire), but
“can you afford it vs should you raise?” isn’t only a spreadsheet call — it
depends on how sure you are on revenue, how fast you’d cut if things slip,
and how much dilution you’d accept.

How about we get a fractional CFO on a short call to pressure-test that with
you? I’ll prep the numbers either way.

Quick — what’s the hire profile so I can put a clean brief together?
(role, rough $ /mo or /yr, FT vs contract, when you’d start)
```

**Backup (if primary feels too long on camera):**

```
Good question — that’s a judgment call, not just a number pull.

To prep a solid brief for you and our fractional CFO: what’s the hire profile?
(role, seniority, rough salary or monthly cost, full-time vs contract, when you’d start)
```

### 9 — Owner: profile

```
Owner: Mid-level engineer, ~$[SALARY]/yr or ~$[MONTHLY]/mo, full-time, ideally
starting next month.
```

### 10 — Tammy: book + graphical brief link (Entry 2 partial)

Send **when the call is booked / offered**, not with the opening weekly report.

```
Got it — I’ll prep cash-flow impact vs runway with that profile.

Book 20 min with our fractional CFO (same numbers, go deeper on afford vs raise):
[CAL_COM_OR_CALENDLY_URL]

If you want a more graphical view, tap here: [BRIEF_URL]
These numbers will be reviewed by the CFO on the call.
```

### 11 — Tammy: pay

```
Session is $[PRICE] (or pay-what-you-want). Pay here when you’re ready:
[STRIPE_PAYMENT_LINK]
```

*(Can be same bubble as book, or right after they book — whichever is cleaner live.)*

### 12 — Before → after (after human / Terac feedback)

**Before** (first take, pre-feedback) — optional short bubble earlier, or show on brief:

```
First take (pre-review): With ~[RUNWAY] months runway and a ~$[MONTHLY] hire,
you’re likely fine for [N] months if revenue holds — but concentration / burn risk
means I’d want a human pass before you commit.
```

**After** (updated in-thread once feedback is in):

```
Updated after expert review: [ONE_OR_TWO_SENTENCE_FIX — e.g. flag the missing risk
they called out, or tighten afford vs raise].

Happy to adjust the brief before your CFO call if anything changed.
```

---

## Demo actor cheat sheet (Owner only)

Say these in order (short):

1. `Thanks`
2. `What’s my main cost category right now?`
3. `Anything unexpected vs the last few weeks?`
4. `I’m thinking about hiring someone to help build the product. I don’t fully get how that hits cash flow — can we afford it, or do we need to raise?`
5. `Mid-level engineer, ~$X/yr, full-time, starting next month.` *(pick real $ for the demo DB)*

---

## Build priority (messaging)

1. Beats 1, 3–11 with real Odoo numbers + Cal + Stripe links  
2. Beat 12 before/after  
3. **Entry 3 Linq human touch** (read / typing / 👍) — before Replay  
4. Brief URL live + Replay on that page last  

---

## Placeholders to fill before demo

| Token | Source |
|---|---|
| `[CASH]`, `[RUNWAY]`, `[TOP_RISK]` | Odoo |
| `[COST_CATEGORY]`, `[AMOUNT]`, … | Odoo |
| `[UNEXPECTED_ITEM]`, deltas | Odoo week-over-week |
| `[CAL_COM_OR_CALENDLY_URL]` | Booking link |
| `[BRIEF_URL]` | Shared call brief |
| `[STRIPE_PAYMENT_LINK]` | Stripe Payment Link |
| `[PRICE]` / hire `$` | Demo script choice |

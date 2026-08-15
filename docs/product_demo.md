# Product Demo — Tamoa (2 minutes)

> Goal: only build what we will show. If it is not in this outline, it is out of scope
> until the core demo works.

Stack: [tech_stack.md](./tech_stack.md) · iMessage script: [imessage_flow.md](./imessage_flow.md) ·
Primers: [primers.md](./primers.md) · UX / Replay (last): [ux_replay.md](./ux_replay.md) ·
Feedback: [feedback_product_demo.md](./feedback_product_demo.md)

---

## One-line pitch

> Text Tammy — your CFO from Tamoa. Monthly numbers from your books, a real expert when
> it matters, and you can book + pay in the same thread.

**Naming:** **Tamoa** = product · **Tammy** = the iMessage agent.

## Product flow (what we are building toward)

Agent-led. Full copy: [imessage_flow.md](./imessage_flow.md).

1. **Agent reaches out** — monthly report over iMessage, when the books settle (cash / runway / one risk).
2. **Short dig-ins (max two)** — e.g. main cost category; anything unexpected vs prior months.
3. **Hard question** — hiring / cash-flow impact / raise — needs a human CFO.
4. **Prep + book** — agent asks hire profile, then sends booking link + graphical brief
   URL (“these numbers will be reviewed by the CFO”).
5. **Pay via Stripe** — payment link in-thread.
6. **Before → after** — update the take after human / Terac feedback.

**Polish after basic flow:** Linq human touch (read, typing, 👍) — higher priority than
Replay. Details in the iMessage script.

---

## What judges must see (non-negotiable)

| Beat | What happens | Why it matters |
|---|---|---|
| 1. Outreach | Agent texts first with a monthly report + question | Proactive CFO, not a chatbot inbox |
| 2. Ground | Numbers come from Odoo | Not a Claude wrapper |
| 3. Reply | Owner answers in iMessage | Real conversational loop (Linq) |
| 4. Book expert | Booking link for a fractional CFO call | Human expertise, timely |
| 5. Improve | Human feedback → updated monthly brief (before → after) | Required Terac / hackathon human loop |
| 6. Charge | Stripe payment link in the same thread | Revenue / Agent-Run Company track |

**Optional:** open the shared call brief + mention Replay QA (see arc below).

---

## Terac before/after (required, lightweight — not the demo hero)

Hackathon rule: human input must make the project measurably better. Having a live CFO
call is the product; it is **not** by itself the before/after.

**What we show**

- **Before:** agent’s first monthly brief / recommendation (from Odoo numbers)
- **Input:** human feedback on that brief (via Terac — and/or comments from the CFO call
  that we fold in the same way): safe? missing risk? 1–2 sentence fix
- **After:** same thread or shared brief shows the **updated** recommendation

The human does **not** need to contradict the agent. Improvement can be “added the risk
they flagged” or a higher “safe to act” rate. **We** change the product because of their
input; the call alone is not enough without a visible before → after.

**In the 2-minute demo:** ~10 seconds — flash before → after. Do not let this eat the
outreach → reply → book → pay story.

---

## 2-minute arc (high level, not a script)

Rough timing. Stay flexible; keep this shape.

| Time | On screen / phone | Say / show |
|---|---|---|
| 0:00–0:10 | Logo / one sentence | Small biz with Odoo — **Tammy** (Tamoa) texts first |
| 0:10–0:35 | iMessage | Monthly report → dig-ins (≤2) proving ledger knowledge |
| 0:35–0:55 | Same thread | Hard question (hire / cash flow / raise) → profile ask |
| 0:55–1:15 | Same thread | **Book CFO** + brief link (“graphical view… CFO will review”) |
| 1:15–1:25 | Thread or brief | **Before → after** after human feedback |
| 1:25–1:45 | Same thread | **Stripe** pay |
| 1:45–2:00 | *(Optional)* Laptop | Shared brief + Replay — only if Linq polish already done |

**Demo success criteria:** judges see report → dig-ins → hard question → book →
before/after → pay. Exact lines: [imessage_flow.md](./imessage_flow.md).

### Optional Replay beat — what UI/UX that is

Only if the iMessage path already works. Details: [ux_replay.md](./ux_replay.md).

- **What it is:** one **shared call brief** (Lovable): monthly numbers, agent recommendation,
  owner’s reply, suggested decision, **Book** + **Pay**.
- **Who it’s for:** **both** the company owner and the human fractional CFO during their
  live conversation — same URL, same facts (not a separate accountant product).
- **In the demo:** 10–15 seconds — open the brief, say this is what they look at together
  on the call, mention Replay QA. Then stop.

---

## Build-to-demo checklist (priority order)

Ship in this order. Stop when the non-negotiable arc works end-to-end.

1. **Linq outbound** — monthly report first.
2. **Odoo-backed dig-ins** — cost category + unexpected vs prior months (max two).
3. **Hard question path** — hire profile → booking link + brief URL at book time.
4. **Stripe once** — payment link in thread.
5. **Terac / before-after** — updated recommendation visible.
6. **Linq human touch** — read, typing, 👍 (after basic flow; **before** Replay).
7. *(Last)* Lovable shared brief + Replay QA.

Do **not** block the demo on: custom Linq booking cards, Agent Pay, or Replay — unless
beats 1–5 already work. Human-touch (6) outranks Replay (7).

---

## Booking in iMessage (keep easy)

**v1 (preferred for hackathon):** paste a **Cal.com / Calendly** link in the thread right
when escalation happens. Owner taps → picks a slot → done.

**v2 if time:** Linq interactive card (“Book 20 min with a CFO”) that opens the same
scheduler, or Agent Pay for checkout in-bubble.

Do not build a custom scheduler.

---

## Explicitly out of scope for v1 demo

- Writing back to Odoo (product rule: read-only forever)
- Long multi-month automation (one monthly outreach is enough to demo)
- Perfect pricing model (one Payment Link is enough)
- A polished web app as the *main* surface (iMessage is the product; web is optional)

---

## Open decisions (keep tiny)

- Which sample business / Odoo DB we point at
- Exact monthly-report + question wording → owned by [imessage_flow.md](./imessage_flow.md)
- Whose calendar the booking link points at (live mentor / recruited CFO / team member)
- Whether CFO-call comments and Terac ratings are the same feedback path or parallel

---

_When ready: paste a real transcript, booking URL, Stripe link, and Replay report here._

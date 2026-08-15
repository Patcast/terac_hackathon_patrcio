# UX / UI + Replay (optional / secondary)

> Messaging is the product. Build this **after** the iMessage script works — including
> Linq human touch (read / typing / 👍) when possible. Replay is **last** priority.
> See [imessage_flow.md](./imessage_flow.md).

The brief URL is sent in iMessage **when the CFO call is booked**, not with the opening
monthly report.

Replay track: Replay QA explores a **web** app, finds bugs, and reports them. It does
not replace the iMessage demo. In the 2-minute arc it is an **optional last beat**
(~15 seconds). See [product_demo.md](./product_demo.md).

---

## What the UI is for

**Shared call brief** — one page both the **company owner** and the **human fractional CFO**
open for the live conversation. Same facts, same thread context, so the call starts warm
instead of “can you forward me your numbers?”

Still **one URL, one page**. Not two products (no separate customer app vs accountant app).

| Who | How they use it |
|---|---|
| **Owner** | Reviews the monthly report before/during the call; Book + Pay if not done in iMessage |
| **Human CFO** | Walks the same numbers with the owner; sees what the agent already said and what the owner replied |
| **Demo / Replay** | Proof the brief loads cleanly and the key actions work |

---

## Why this is better than “customer-only snapshot”

- The booked CFO call is a core demo beat — the UI should serve **that** moment.
- Owner and expert stay aligned on Odoo-backed figures (agent never invents; UI doesn’t either).
- Chat stays the trigger; the page is the **shared worksheet for the human conversation**.

---

## Minimum UX (one scroll, three blocks)

Keep it boring and useful:

1. **This month’s numbers** — cash, runway, top risk (same as the iMessage report)
2. **Conversation context** — agent’s last recommendation + owner’s latest reply (and Terac before/after if you have it)
3. **Call actions** — **Book / join** (same Cal.com link) · **Pay** (Stripe) · optional one-line **suggested agenda** (“Decide: hire next month — yes/no/wait”)

No settings, no multi-company switcher, no chart decoration, no private CFO-only notes in v1
(that splits the page and burns time). If the CFO needs a private pad, use a note app —
don’t build it.

---

## Flow around the live call

```
iMessage monthly report → owner replies → book CFO + pay
         ↓
 both open the same brief URL on the call
         ↓
 talk through numbers + decision → done
```

In the demo you can either:
- Show the brief **as what they’ll open on the call**, or
- Briefly role-play owner + CFO both looking at it (only if time)

---

## Where Replay fits

**Optional closing beat:**

1. Open the shared brief  
2. Point: “owner and fractional CFO use this on the call”  
3. One sentence: Replay QA’d this page  
4. End  

Replay should cover:

1. Numbers + context load (not empty)  
2. Book + Pay links work  
3. Page is readable on laptop (CFO) and phone width (owner) if you have time  

**If Replay isn’t ready, skip the laptop** and end on Stripe Paid in iMessage.

---

## Booking UX note

Same Cal.com / Calendly URL in iMessage and on the brief’s Book button. One scheduler.

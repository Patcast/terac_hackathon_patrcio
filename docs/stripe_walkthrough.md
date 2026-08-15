# Stripe Setup — Tamoa Walkthrough

Our own step-by-step for the hackathon's Stripe requirement. **Decision made: we run the hackathon
on a brand-new personal Stripe account, kept entirely separate from the existing business account.**
The organizers' original text is in `docs/stripe_set_up.md` (recover with
`git show HEAD:docs/stripe_set_up.md`); this doc is what we actually do.

---

## What we have to produce

| # | Item | Format | Goes to |
|---|---|---|---|
| 1 | Team name | `Tamoa` | Organizers |
| 2 | Payment Link URL | `https://buy.stripe.com/…` | Organizers + the agent (`STRIPE_PAYMENT_LINK_URL`) |
| 3 | Restricted read-only key | `rk_live_…` | Organizers **only** |
| 4 | Secret key | `sk_live_…` | Render env only — **never** shared |
| 5 | Webhook signing secret | `whsec_…` | Render env only |

Items 1–3 are the prize requirement (Best Overall Project / Best Overall Agent-Run Company).
Items 4–5 are for our own code — the organizers never see them.

Everything must be created in **live mode**. A test-mode link takes no real money and a
`rk_test_` key reports $0 revenue.

---

## Step 0 — Decide which account this runs on (do this first)

This is the one decision your existing business account changes, and it's worth two minutes.

The restricted key we hand over grants **Charges: Read** and **Balance: Read** across the *whole
account*. On your real business account that means organizers can list every real customer charge
and see your real balance. Nothing they can move — but more visibility than you want to give away.

**Recommended: create a second live Stripe account for the hackathon.**

1. Stripe Dashboard → click the account name (top-left) → **＋ New account**.
2. Name it `Tamoa` (or `Tamoa Hackathon`).
3. Complete activation for it: business/individual details, tax ID if asked, and a bank account for
   payouts. A sole-proprietor/individual activation is fine and is the fastest path.
4. Do every step below **inside that account** — check the top-left switcher before each one.

If you'd rather not activate a second account under time pressure, using the existing business
account works and is what the organizers assume. Just go in knowing the read-only key exposes your
real charge history for the day.

> A Stripe **Sandbox** is *not* an option here — sandbox/test data doesn't count as revenue.

**Before continuing, confirm:**
- Top-left switcher shows the account you intend to use.
- The test-mode toggle is **off** (you're in live mode).
- The account can accept charges — Dashboard home shouldn't be nagging you to "complete your
  account". If it is, finish activation first; payment links in an unactivated account can't
  collect money.

---

## Step 1 — Create the Payment Link

One link, reused for every transaction all day. Variable pricing is handled by letting the customer
enter the amount, not by creating new links.

1. Dashboard → **Payment links** (left sidebar, or search "payment links").
2. **＋ Create payment link**.
3. Product: **＋ New product** → name it `Tamoa CFO Engagement`. The name shows up at checkout, so
   make it something a demo audience reads well.
4. Pricing: choose **Customer chooses price**.
   - Currency: **USD**.
   - Set a **preset/suggested amount** (e.g. $25) so the agent's link opens with a sane default.
   - Optionally set a minimum (e.g. $1) to block $0 checkouts.
5. Under **Options**, worth turning on:
   - **Collect customer email** — lets us match a payment back to the iMessage thread.
   - **After payment → Show confirmation page** with a short custom message.
6. **Create link** → **Copy link**.
7. Paste it into `.env` as `STRIPE_PAYMENT_LINK_URL` and into the submission form.

**Do not create a second link later.** Revenue tracking follows the link you submitted; a
replacement link's payments are invisible to organizers. If you truly must regenerate it, tell the
organizers.

Sanity check: open the link in a private window. It should say "live", not show a test-mode banner,
and it should present a real card form.

---

## Step 2 — Create the restricted read-only key

1. Dashboard → **Developers** → **API keys** (direct: `dashboard.stripe.com/apikeys`).
2. Confirm again you're in **live mode**, in the right account.
3. Scroll to **Restricted keys** → **＋ Create restricted key**.
4. Name: `hackathon-readonly`.
5. Permissions — set exactly two, leave every other row on **None**:
   - **Balance** → **Read**
   - **Charges** → **Read**
   
   The list is long; use the page's search/filter rather than scrolling if it's there. Do not grant
   "All core resources", and do not grant any Write.
6. **Create key** → **Reveal** → copy it. It starts with `rk_live_`.
   
   Stripe shows the full value once. If you lose it, delete that key and create another — no harm.
7. Store it somewhere your team can reach (password manager or the submission form directly). **Not
   in this repo**, not in a git-tracked file, not pasted into chat logs.

Why this key is safe to hand over: it cannot charge cards, refund, create payouts, or read your
login. It can only list charges and view the balance.

**Never generate or share `sk_live_…` with anyone outside the team.** If an organizer or anyone else
asks for the secret key, that's wrong — the restricted key is the answer.

---

## Step 3 — Keys for our own service

These stay in Render's environment settings. Nothing in the repo; `.env` stays gitignored.

**Secret key** — Developers → API keys → **Standard keys** → reveal the live secret key
(`sk_live_…`) → `STRIPE_SECRET_KEY`.

Build against **test mode** (`sk_test_…`) while wiring the code, then swap to live before the demo.
The one thing that must be live from the start is the *submitted* payment link and `rk_` key.

**Webhook** — so the iMessage invoice card can flip `Pending → Paid`:

1. Developers → **Webhooks** → **＋ Add endpoint**.
2. Endpoint URL: our Render service, e.g. `https://tamoa.onrender.com/webhooks/stripe`.
3. Events to send:
   - `checkout.session.completed` — the payment link was paid.
   - `payment_intent.succeeded` — belt and braces.
4. Add endpoint → copy the **Signing secret** (`whsec_…`) → `STRIPE_WEBHOOK_SECRET`.
5. Verify every incoming webhook's signature with it. An unverified webhook endpoint is a "mark any
   invoice paid" button for the entire internet.

Resulting env block (mirrors [tech_stack.md](./tech_stack.md) §11):

```bash
STRIPE_SECRET_KEY=sk_live_...        # server only, NEVER shared
STRIPE_PAYMENT_LINK_URL=https://buy.stripe.com/...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## Step 4 — Submit to organizers

Send exactly three things:

- Team name: **Tamoa**
- Payment Link URL: `https://buy.stripe.com/…`
- Restricted API key: `rk_live_…`

Then don't touch the link or the key for the rest of the event.

---

## Step 5 — Prove it works before demo pressure

1. Open the payment link, pay yourself a small real amount ($1) with a real card.
2. Dashboard → **Payments**: the charge appears in live mode.
3. Dashboard → **Balance**: the amount shows as pending. That's what the organizers' read of the
   restricted key will see.
4. Render logs: the `checkout.session.completed` webhook arrived and passed signature verification.
5. Refund yourself if you like — refunds reduce the tracked total, so do this test early rather than
   in the final hour.

---

## Gotchas that actually bite

- **Test-mode toggle.** The single most common failure. A `rk_test_` key or a test payment link
  means organizers see zero revenue and we're not eligible. Check the toggle on every page.
- **Wrong account.** With multiple accounts, it's easy to make the link in one and the key in the
  other. They must be the same account.
- **Unactivated account.** Live charges need business details + a bank account on file. Finish this
  before the event starts, not while a judge is watching.
- **Payout schedule is irrelevant.** Money sitting as "pending" in the balance still counts as
  revenue earned. Don't chase payouts.
- **The payment link is public.** It's meant to be sent over iMessage. Nothing sensitive in the
  product name or confirmation message.
- **Secrets discipline.** `rk_` is the only Stripe key that leaves our hands. `sk_` and `whsec_`
  live in Render only.

---

## Not required: the Atlas offer

The hackathon also offers 20% off **Stripe Atlas** plus $2,500 in Stripe credits
(<https://dashboard.stripe.com/atlas/invite/b5zxto4k>). Atlas incorporates a **new Delaware C-corp** —
it's only worth claiming if we intend to incorporate a new entity for Tamoa. Since a business
account already exists, this is unrelated to the payment requirement above. Ignore it for the
hackathon; revisit if Tamoa becomes a real company.

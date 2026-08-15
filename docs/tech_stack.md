# Tech Stack — Tamoa (Fractional CFO as a Service)

An agent that acts as a fractional CFO for small businesses: it pulls real accounting
data from Odoo, reasons over it with Claude, talks to the client over iMessage via Linq,
charges for the work through Stripe, and escalates judgment calls to real finance experts
recruited through the Terac API/MCP.

Product scope lives in [product_demo.md](./product_demo.md). This doc is the stack.

> **Naming:** **Tamoa** is our product. **Terac** is the hackathon organizer and the
> third-party service we call to reach real finance experts. Where this doc says "Terac"
> it means their API/MCP, not us.

---

## 1. At a glance

| Layer | Choice | Why |
|---|---|---|
| Conversational UI | **Linq** (iMessage / RCS / SMS) | Client talks to their CFO in the blue bubble. No app to install. |
| Reasoning engine | **Claude Opus 5** (`claude-opus-5`) | The CFO brain — analysis, narrative, tool orchestration. |
| Accounting data | **Odoo** external API | Source of truth for P&L, AR/AP, cash, invoices. |
| Human expertise | **Terac** API/MCP | Real finance experts review, rate, and correct the agent's output. |
| Payments | **Stripe** | Collects revenue; also the hackathon's revenue-tracking requirement. |
| Web UI | **Lovable** (fallback: Cursor) | Dashboard / onboarding, built fast. |
| UI verification | **Replay** (qa.replay.io) | Records and replays the UI so we can prove flows actually work. |
| Hosting | **Render** | Free credits, one-click deploy for the webhook service. |

---

## 2. Architecture

```
                          ┌──────────────────────────┐
   Client's iPhone        │       Tamoa Agent        │        Finance experts
   ┌───────────┐          │   (Node/Python service   │        ┌───────────┐
   │ iMessage  │◄────────►│    hosted on Render)     │◄──────►│  Terac    │
   └───────────┘   Linq   │                          │  Terac │  panel    │
                  webhook │  ┌────────────────────┐  │  MCP   └───────────┘
                          │  │  Claude Opus 5     │  │
   ┌───────────┐          │  │  (tool use loop)   │  │
   │ Dashboard │◄────────►│  └────────────────────┘  │
   │ (Lovable) │          │                          │
   └───────────┘          └───┬──────────────┬───────┘
         ▲                    │              │
         │                Odoo API       Stripe API
      Replay                  │              │
    (recording)          ┌────▼────┐   ┌─────▼─────┐
                         │  Odoo   │   │  Stripe   │
                         │ ledger  │   │ payments  │
                         └─────────┘   └───────────┘
```

**Core loop:** client texts → Linq webhook → agent builds context (Odoo financials +
conversation history) → Claude Opus 5 reasons and calls tools → if the answer needs human
judgment, Terac routes it to finance experts → agent replies over iMessage → billable
work is invoiced through a Stripe payment link sent in the thread.

---

## 3. Linq — messaging layer

The client-facing surface. One API for iMessage, RCS, and SMS, plus realtime webhooks on
every event.

- **Setup:** <https://linqapp.com/hackathon> → Sandbox Signup → select **"Hackathon"** in the
  "How did you hear about us?" dropdown. Apply their best-practices instructions.
- **We get a real phone number** the agent owns. The client saves it as "My CFO".

What we use beyond plain text:

| Linq feature | How Tamoa uses it |
|---|---|
| **iMessage Apps** (interactive cards) | Render a cash-flow snapshot or an invoice card inline. Card flips `Pending → Paid` when Stripe confirms. |
| **Tapback reactions** | 👍 on a recommendation = approve. Reaction is the confirmation UI — no forms. |
| **Typing indicator** | Loading state while Claude and Odoo are working. |
| **Read receipts** | Know whether the CFO advice actually landed. |
| **Realtime webhooks** | Inbound trigger for the whole agent loop. |
| **Agent Pay / Apple Pay App Clip** | Checkout inside the thread; funds settle to our own Stripe account. |

> Design rule: treat messaging primitives as UI. A tapback is a vote, a group thread is a
> multi-stakeholder finance review.

---

## 4. Claude Opus 5 — the reasoning engine

Model ID: **`claude-opus-5`** — $5 / $25 per million tokens (in/out), 1M context window,
128K max output.

- **Thinking:** on by default. Leave adaptive thinking on; control depth with
  `output_config: {"effort": ...}`. Start at `high`, sweep `medium`/`low` — Opus 5 is
  unusually strong at lower effort and that's the main cost lever for a hackathon budget.
- **Do not** pass `temperature`, `top_p`, `top_k`, or `budget_tokens` — all return 400 on
  Opus 5. Steer with prompting.
- **Prompt caching:** the CFO system prompt + the client's chart of accounts are stable —
  put a `cache_control` breakpoint after them. Minimum cacheable prefix on Opus 5 is 512
  tokens, so even a modest preamble caches. Cache reads are ~0.1× input price.
- **Tool use:** the SDK tool runner drives the loop. Tools we expose to Claude:

| Tool | Purpose |
|---|---|
| `get_financials` | Pull P&L / balance / cash position from Odoo for a period |
| `list_open_invoices` | AR aging — who owes us, how late |
| `list_open_bills` | AP — what we owe, when |
| `run_scenario` | Cash runway projection under assumptions |
| `ask_expert` | Escalate to the Terac human panel |
| `send_payment_link` | Drop the Stripe payment link into the thread |
| `send_imessage_card` | Render an interactive Linq card |

- **Guardrails:** the agent must never invent a number. Every figure in a reply has to
  trace to an Odoo tool result. Financial claims without a tool call backing them are a bug.

---

## 5. Odoo — accounting data

Odoo is the ledger. **Read-only — permanently, not just in v1.** Tamoa analyzes and
advises; it never posts an entry, edits an invoice, or touches the books. That's a
product decision as much as a safety one: a CFO that can silently rewrite your ledger is
a liability, and "we only read" is a sentence you can say to a prospect.

**Target version: the latest Odoo release.** At time of writing that's **Odoo 19** —
verify against the actual instance before building, since a new major ships each autumn
and the client's DB may lag.

**Access:** Odoo's external API. XML-RPC is the stable, documented path that has survived
every version — `/xmlrpc/2/common` to authenticate, `/xmlrpc/2/object` to call
`execute_kw`. JSON-RPC at `/jsonrpc` is equivalent if that's easier from our runtime. Both
are the safe bet; newer REST-style surfaces vary by version and edition, so don't design
around one without confirming it exists on the target instance.

**Enforcing read-only:** don't rely on our code being well-behaved. Create a dedicated
Odoo user for Tamoa with read access groups only (Accounting → Read, no create/write/
unlink on `account.*`). Then a bug can't write even if it tries. Our client should also
whitelist `search_read` / `read` / `search_count` as the only permitted `execute_kw`
methods.

Models we care about:

| Odoo model | What we read |
|---|---|
| `account.move` | Invoices, bills, journal entries (`move_type`, `amount_total`, `invoice_date_due`, `payment_state`) |
| `account.move.line` | Line-level detail for P&L breakdowns |
| `account.account` | Chart of accounts — the categories the CFO reasons in |
| `res.partner` | Customers and vendors |
| `account.payment` | Cash actually received / sent |

**Derived metrics** the agent computes on top: monthly burn, runway in months, AR aging
buckets (0–30 / 31–60 / 61–90 / 90+), gross margin trend, top-5 customer concentration.

> ⚠️ Odoo's API surface differs across major versions and between Odoo Online (SaaS) and
> self-hosted. Confirm the instance's actual version and that the DB allows external API
> access before wiring the client — this is the integration most likely to eat time. On
> Odoo Online in particular, external API access can be restricted.

**Auth:** database name + username + API key (generate under Settings → Account Security →
Developer API Keys). Never the account password.

---

## 6. Terac — human finance experts

**Required for every project in this hackathon**, and genuinely load-bearing for the
product: a fractional CFO whose recommendations no human ever checks isn't a CFO.

- Redemption link: <https://terac.com/r/rGi7O0EfkRbzmiElg8kRjES5W2JrKNYc>
- Launch studies aimed at the **General Population** for fastest results.

How we use it:

1. **Expert review in the loop.** When Claude produces a recommendation above a
   materiality threshold (e.g. anything touching >10% of monthly cash), `ask_expert`
   sends the recommendation + supporting figures to the Terac panel for rating.
2. **Labeled data.** Every expert rating is stored as a labeled example: was this CFO
   advice correct, useful, actionable?
3. **Measurable before/after.** We keep a held-out set of financial questions, score the
   agent before expert feedback and after we fold the ratings into the prompt / rubric,
   and show the delta. That before/after is the hackathon deliverable.

---

## 7. Stripe — payments

Two separate jobs, don't conflate them.

**a) Collecting revenue.** One Payment Link, reused for every transaction, with
**"Customer chooses price"** so variable CFO engagements don't each need a new link. The
agent sends this link in the iMessage thread (or triggers Linq Agent Pay, which settles to
the same Stripe account).

**b) Hackathon revenue tracking.** Organizers need read-only visibility:
- Create a **restricted key** named `hackathon-readonly` with **Balance: Read** and
  **Charges: Read**, everything else **None**. It starts with `rk_`.
- Submit: team name + Payment Link URL + restricted key.
- **Never** generate or share the secret key (`sk_`). Never change the payment link
  mid-event — revenue tracking would miss the new one.

Full steps are in the committed `docs/stripe_set_up.md` (recover with
`git show HEAD:docs/stripe_set_up.md`).

Also worth claiming: Stripe Atlas offer — 20% off + $2,500 in credits
(<https://dashboard.stripe.com/atlas/invite/b5zxto4k>).

---

## 8. Lovable / Cursor — web UI

The dashboard: connect Odoo, see the CFO snapshot, review expert feedback, view billing.

- **Lovable** for the first pass — Pro Plan 1 (100 credits) free with code
  **`COMM-THE-4G9T`** at checkout (lovable.dev → Settings → Plans & Credits → monthly plan).
  Existing paid accounts need a new workspace to redeem.
- **Cursor** for anything Lovable can't express, and for all backend/agent code.

Split: Lovable owns presentational React; the agent service stays hand-written in Cursor.
Don't let generated code reach into the Stripe or Odoo credentials — the UI talks to our
API only.

---

## 9. Replay — verification

Sign up at <https://qa.replay.io/>, enter code **`HACKATHON`** on the billing page for
unlimited access during the event.

Replay is how we *prove* the product works instead of asserting it. Record the flows that
matter:

1. Onboarding: connect Odoo → first financial snapshot renders.
2. The CFO loop: question in → tool calls → answer with real numbers out.
3. Expert escalation: recommendation → Terac review → updated answer.
4. Payment: invoice card → Stripe link → card flips to Paid.

Recordings double as the demo: a Replay of the real flow beats a slide. When something
breaks mid-demo-prep, the recording is the debugger.

---

## 10. Render — hosting

The agent service (Linq webhook receiver + Claude loop + Odoo/Stripe clients) runs here.

- Credits: <https://credits-portal-mmdm.onrender.com/claim/terac-hackathon>
- Covers plan fee, compute, and bandwidth: <https://render.com/docs/credits>
- Needs a stable public HTTPS URL for Linq and Stripe webhooks — this is the main reason
  it's Render and not localhost.

---

## 11. Environment variables

```bash
# Claude
ANTHROPIC_API_KEY=

# Linq
LINQ_API_KEY=
LINQ_PHONE_NUMBER=
LINQ_WEBHOOK_SECRET=

# Odoo  (read-only service user — see §5)
ODOO_URL=            # https://<company>.odoo.com
ODOO_DB=
ODOO_USERNAME=       # dedicated Tamoa user, read groups only
ODOO_API_KEY=        # Developer API key, never the account password

# Stripe
STRIPE_SECRET_KEY=           # sk_ — server only, NEVER shared
STRIPE_PAYMENT_LINK_URL=     # the one submitted to organizers
STRIPE_WEBHOOK_SECRET=

# Terac
TERAC_API_KEY=
```

All secrets in Render's environment settings. Nothing in the repo — `.env` stays
gitignored, and the restricted `rk_` key is the *only* Stripe key that leaves our hands.

---

## 12. Build order

Ship a thin vertical slice first, then deepen.

1. **Render service up** with a health check and a Linq webhook that echoes back. Proves
   the phone number round-trips.
2. **Odoo read** — one call returning a real cash position. This is the riskiest
   integration; do it early.
3. **Claude loop** — Opus 5 with `get_financials` only. Ask "how's my cash?" over
   iMessage, get a grounded answer.
4. **Stripe payment link** in the thread + the `rk_` key submitted to organizers. Do this
   before the deadline pressure, not after.
5. **Terac expert loop** — escalate, collect ratings, record the before/after delta.
6. **Lovable dashboard** + **Replay recordings** of all four flows.
7. Interactive Linq cards and Agent Pay if time remains — highest demo payoff per minute.

---

## 13. Also available (unused, but claimed)

Credits redeemed but not in the critical path — noted in case a gap opens up:
Superserve, Pioneer by Fastino Labs (`ZeroHumanHack0826`), Band (`HACKBANDAUG26`),
sandbox0, Solari by Pinetree Research (`ZEROHUMANHACK-SWSYP3XJ`, headless browsers and
sandboxes — plausible fallback if Odoo has no API access and we need to scrape a portal).

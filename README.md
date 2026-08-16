# Tamoa

**Text Tammy — your fractional CFO from Tamoa.** Monthly numbers from your books, a real expert when it matters, and you can book + pay in the same thread.

**Tamoa** is the product. **Tammy** is the agent on iMessage.

Built for the [Terac Zero Human Company Hackathon](https://terac.com/events/hackathon) (15 Aug 2026).

---

## The problem

Small businesses already have a bookkeeper and a ledger. They do not have anyone who looks at the month and says what it means — cash, runway, the one risk — in language an owner can act on. A full-time CFO is too expensive. A chatbot that guesses numbers is worse.

## What Tammy does

1. **Texts first** when a month’s books settle (cash, runway, one thing to watch).
2. **Answers dig-ins from the ledger** — main cost category, unexpected vs prior months — never from invented figures.
3. **Escalates the hard call** (hire / raise / big spend) to a real fractional CFO.
4. **Hands both sides a shared brief** — same URL, same Odoo-backed numbers — then **book** and **pay** in-thread.

iMessage is the product. The web page is the worksheet owner and expert open together on the call.

---

## Why this is not a Claude wrapper

Every figure Tammy says has to come from the books. The agent **never writes to Odoo** (read-only forever) and **never invents a number**. If a report times out, she says what she could not read instead of filling the gap.

The books are assembled from **16 Odoo reports** into one `MonthlyBook` (P&L, balance sheet, cash, AR/AP aging, trailing 12 months, tax, partners, chart of accounts). Claude sees that book and answers. Domain rules — runway, settling window, “is this a one-off or a trend” — live in TypeScript, not in the prompt.

---

## Hackathon loop (human input → better product)

Judging wants a working app, real people in the loop, and a visible **before → after**.

| Beat | What happens | Why it matters |
| --- | --- | --- |
| Outreach | Tammy texts the monthly close-out first | Agent-run, not a chatbot inbox |
| Grounded answers | Numbers from Odoo over **Linq** iMessage | Real conversational loop |
| Expert | Finance person reviews the brief (sourced on **Terac**) | Human judgment on a material call |
| Before → after | `POST /api/brief/review` stores the agent’s take and the expert’s rewrite | The brief shows both; the product changed |
| Revenue | **Stripe** payment link on the brief / in-thread | Agent-run company track |

**Before:** Tammy’s first monthly recommendation, from the ledger.  
**Input:** a screened finance expert rates / rewrites it (safe? missing risk? one-line fix).  
**After:** the same brief shows the updated recommendation. The human does not have to contradict the agent — adding the risk they flagged is enough.

How we recruit and brief those experts: [docs/expert_brief.md](docs/expert_brief.md). The write-back that makes before/after visible: `src/adapters/inbound/web/BriefController.ts`.

---

## Stack

| Layer | Tool | In this repo |
| --- | --- | --- |
| iMessage / RCS / SMS | **Linq** | Webhook in, text out, typing indicator while Odoo + Claude run |
| Reasoning | **Claude Opus 5** (`claude-opus-5`) | One grounded call per question; system prompt + chart of accounts cached |
| Ledger | **Odoo 19** JSON-2 API | Read-only service user; 16 parallel reports → one `MonthlyBook` |
| Human experts | **Terac** | Opportunity + screener for fractional-CFO review ([expert_brief.md](docs/expert_brief.md)) |
| Shared brief | Static **web** app (`web/`) | Same facts as the thread; Book + Pay; before/after review |
| Payments | **Stripe** Payment Link | `PAYMENT_URL` on the brief (and in-thread when configured) |
| Booking | Cal.com / Calendly | `BOOKING_URL` on the brief |
| Hosting | **Render** (intended for the public webhook URL) | Node HTTP server, no framework |
| QA (optional) | **Replay** | Web brief is the Replay surface |

Built in **TypeScript / Node** (hexagonal layout: `domain/` knows nothing about Linq, Odoo, or Claude). Agent and backend written in **Cursor**. Fixture books mean the brief demo needs **no API keys**.

---

## Quick start (no credentials)

Node 22+. This is the demo path judges can clone and open.

```bash
git clone https://github.com/Patcast/terac_hackathon_patrcio.git
cd terac_hackathon_patrcio
npm install
npm run brief          # → http://localhost:3000
```

Serves the shared monthly brief off `FixtureBookRepository` — an internally consistent set of books for a sample studio. Figures reconcile (P&L matches the trailing series; cash ÷ burn is the runway on the page). No `.env`, no Odoo, no Claude.

| Route | What it is |
| --- | --- |
| `GET /` | Shared call brief |
| `GET /api/brief?client=&month=` | Same view model as JSON |
| `POST /api/brief/review` | Record expert before → after |
| `GET /health` | Ledger mode + whether messaging is on |
| `POST /webhooks/linq` | Inbound iMessage (503 if Linq/Claude keys are missing) |

Point at a month with `?month=2026-07`.

---

## Full stack (live books + iMessage)

```bash
cp .env.example .env   # fill Claude, Linq, Odoo
npm start              # brief + Linq webhook
npm run ask -- "What was my biggest cost in July?"
npm run kickoff        # outbound monthly close-out — texts real people
```

`USE_FIXTURES=true` keeps the ledger offline; live Odoo is the default when that flag is off. Full env map, failure modes, and demo rehearsal order: [docs/running.md](docs/running.md).

```bash
npm run test:unit      # no network
npm test               # includes live Claude / Linq / Odoo checks if .env is set
npm run typecheck
```

---

## Repository layout

```
src/domain/          Product rules (money, month, runway, grounding)
src/application/     Use cases: answer a question, build the monthly report
src/adapters/        Odoo, Claude, Linq, web brief, fixtures
src/presentation/    iMessage copy + brief view models
src/composition/     HTTP server, kickoff, ask CLI
web/                 Shared brief UI
tests/               Domain, adapters, architecture dependency rule
docs/                Demo script, expert brief, architecture
```

The dependency rule is tested: domain code cannot import adapters. Swapping Odoo for another ledger must not touch the word “runway”.

---

## Demo script (2 minutes)

What judges should see, in order: outreach → Odoo-backed dig-ins → hard question → book expert → before/after → Stripe.

- [docs/product_demo.md](docs/product_demo.md) — 2-minute arc
- [docs/imessage_flow.md](docs/imessage_flow.md) — full iMessage copy
- [docs/imessage_flow_phase1.md](docs/imessage_flow_phase1.md) — what Phase 1 can say today (Linq + Odoo + one Claude call)
- [docs/architecture_phase1.md](docs/architecture_phase1.md) — how the code is shaped

**Phase 1 shipped:** monthly close-out, grounded Q&A over iMessage, typing indicator, shared brief, expert review write-back, Book + Pay links.  
**Next seams (same ports):** tapbacks / read receipts, Linq payment requests, Claude tool loop, Terac `ask_expert` inside the agent.

---

## License

ISC

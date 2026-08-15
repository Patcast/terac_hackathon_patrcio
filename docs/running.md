# Running Tamoa

Everything you can start, what each thing needs, and what to do when one of them won't.

Architecture: [architecture_phase1.md](./architecture_phase1.md) ·
Web brief: [ui_proposal.md](./ui_proposal.md) ·
Script: [imessage_flow_phase1.md](./imessage_flow_phase1.md)

---

## 0. The 30-second version

```bash
npm install
npm run brief          # → http://localhost:3000
```

**No `.env`, no API keys, no Odoo.** That is not a degraded mode — it is the demo running on
`FixtureBookRepository`, an internally consistent set of books for Blackthorn Studio that is
built in TypeScript for whatever month you ask for. The figures reconcile with each other
(the P&L equals the last row of the trailing series; cash ÷ three months' burn lands on ~7
months of runway), so everything the page says is true of a real, if invented, business.

---

## 1. Prerequisites

| | |
|---|---|
| Node | 22 or newer — developed on 26.4 |
| npm | 10 or newer |
| TypeScript | Run through `tsx`; there is no build step and nothing is emitted |

```bash
git clone https://github.com/Patcast/terac_hackathon_patrcio.git
cd terac_hackathon_patrcio
npm install
```

---

## 2. The two modes

Everything below runs in one of two modes, and the switch is a single environment variable.

| | `USE_FIXTURES=true` | `USE_FIXTURES=false` (default) |
|---|---|---|
| Ledger | Built in TypeScript, no network | Live Odoo, 15 reports per book |
| Needs | Nothing | `ODOO_URL`, `ODOO_API_KEY` |
| Month coverage | Any month you ask for | Whatever the ledger actually holds |
| Determinism | Byte-identical every run | Whatever Odoo says today |

> **`USE_FIXTURES` is demo insurance.** Odoo's external API varies by version and between
> Online and self-hosted, and the failure that costs a demo is the one discovered on the
> morning of. Rehearse in both modes; keep the fixture path working.

---

## 3. Configuration

Copy the template and fill in what you need:

```bash
cp .env.example .env
```

Nothing is required to boot. Each block below is only needed by the things that use it.

### Vendors

| Variable | Needed by | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | `ask`, `kickoff`, the Linq webhook | Not the web brief — it makes no model call |
| `LINQ_API_KEY`, `LINQ_PHONE_NUMBER` | `kickoff`, the Linq webhook | |
| `LINQ_WEBHOOK_SECRET` | The webhook, optionally | When set, checked against `x-linq-signature` |
| `ODOO_URL`, `ODOO_API_KEY` | Everything, unless `USE_FIXTURES=true` | Read-only service user. The JSON-2 bearer key resolves both the database and the user, so there is no `ODOO_DB` / `ODOO_USERNAME` |

### Phase 1 knobs

All have defaults; none are secrets.

| Variable | Default | What it decides |
|---|---|---|
| `USE_FIXTURES` | `false` | See above |
| `SETTLING_DAYS` | `10` | Days after month end before books count as settled. **A product setting wearing a config variable's clothes** — it decides which month Tammy talks about by default |
| `TRAILING_MONTHS` | `12` | Window for the trailing series; 12 gives same-month-last-year |
| `RUNWAY_WINDOW_MONTHS` | `3` | Months of burn averaged for runway |
| `REPORT_CONCURRENCY` | `6` | Parallel Odoo calls |
| `REPORT_TIMEOUT_MS` | `8000` | Per report. A timeout is a gap, not a failure |
| `BOOK_CACHE_ENABLED` | `true` | Follow-up questions about the same month come back in ~1s |
| `CLIENT_REGISTRY_JSON` | — | Phase 1's client "database", keyed by the phone the client texts from |
| `PORT` | `3000` | |

`CLIENT_REGISTRY_JSON` looks like this — one entry per client, and lookups match on digits
only, so however you type the number is fine:

```json
{ "+15550101234": { "clientId": "demo", "businessName": "Blackthorn Studio", "odooCompanyId": 1 } }
```

### Web brief

| Variable | Effect when unset |
|---|---|
| `BOOKING_URL` | The **Book 20 min** button renders visibly unavailable rather than 404ing on stage |
| `PAYMENT_URL` | Same, for **Pay** |
| `SESSION_PRICE` | The button reads "Pay for the session" with no figure |

---

## 4. What you can start

### The server — `npm start` / `npm run brief`

Hosts the web brief **and** the Linq webhook on one port.

```bash
npm run brief                    # fixtures, no credentials needed
npm start                        # live Odoo + Claude + Linq, reads .env
PORT=4000 npm run brief          # somewhere else
```

| Route | |
|---|---|
| `GET /` | The brief ([ui_proposal.md](./ui_proposal.md)) |
| `GET /api/brief?client=&month=` | Its view model as JSON |
| `POST /api/brief/review?client=&month=` | Record an expert's before → after |
| `GET /api/settings` | Booking link, payment link, price |
| `GET /health` | Client count, ledger mode, whether messaging is configured |
| `POST /webhooks/linq` | Inbound messages |

**The messaging credentials are optional here.** The composition root builds in two halves:
if `ANTHROPIC_API_KEY` or the Linq keys are missing, the server says so loudly, serves the
brief anyway, and answers `/webhooks/linq` with 503. You will see:

```
[server] messaging is OFF — Claude: missing environment variable(s): ANTHROPIC_API_KEY
[server] serving the web brief only; the Linq webhook will answer 503.
```

Point a specific month or client at the page with query parameters — `?month=2026-05`,
`?client=demo`. An unknown `client` is a 404 by design, so the parameter cannot be used to
walk through every company in an Odoo database.

### Rehearse an answer — `npm run ask`

The cheapest way to exercise the whole stack (ledger → book → Claude → footer) without
texting a real handset.

```bash
npm run ask -- "What was my biggest cost in July?"
USE_FIXTURES=true npm run ask -- "Who still hasn't paid me?" 2026-07
```

Same use case, same book, same presenter as the webhook — it just stops one step short of
sending. Needs `ANTHROPIC_API_KEY`, and at least one client in `CLIENT_REGISTRY_JSON`.

### Send the monthly close-out — `npm run kickoff`

**This texts real people.** It is the one outbound trigger: beat 1 of the script, sent to
every client whose books have settled.

```bash
npm run kickoff                  # the last settled month
npm run kickoff 2026-07          # a specific one
```

Needs Claude *and* Linq. Prints one `SENT` / `FAILED` line per client rather than throwing,
so one client's broken connection doesn't cancel everyone else's month.

### Tests

```bash
npm test                         # everything, including live vendor checks
npm run test:unit                # offline only — no network, no credentials
npm run typecheck
```

`npm test` includes `tests/connectivity.test.ts`, which **talks to the real Claude, Linq and
Odoo**. It sends nothing and writes nothing; it answers one question per service — are the
credentials in `.env` real and usable? Without a `.env` those three will fail and everything
else will pass. Use `test:unit` when you just want the logic checked.

---

## 5. When it won't run

| What you see | What it means |
|---|---|
| `MissingCredentialsError: Odoo: missing environment variable(s): ODOO_URL` | No `.env`, and `USE_FIXTURES` is not set. Either fill it in or run `npm run brief` |
| `[server] messaging is OFF` | Expected without Claude/Linq keys. The brief still works; the webhook returns 503 |
| Page loads, "No brief to show" | The ledger didn't answer. The message shown is the same copy Tammy texts — check the server log for the underlying error |
| `no clients registered` from `ask` | Set `CLIENT_REGISTRY_JSON`. The web brief doesn't need it under fixtures; `ask` does |
| `EADDRINUSE` | Something else is on 3000. `PORT=4000 npm run brief` |
| The page looks stale after an edit | It shouldn't — `.html`, `.css` and `.js` are served with `max-age=0`. If it persists, hard-reload (⌘⇧R) |
| `I couldn't get a complete read of your July books` | A Required report failed. This is the product behaving correctly: it would rather say nothing than answer on a partial ledger |

---

## 6. Rehearsing the demo

The order that catches the most, fastest:

1. `npm run test:unit` — logic is intact
2. `npm test` — the credentials in `.env` are real
3. `USE_FIXTURES=true npm run ask -- "How did July go?"` — the whole stack, offline
4. `npm run ask -- "How did July go?"` — the whole stack, against live Odoo
5. `npm run brief` and open <http://localhost:3000> — the page, offline
6. `npm start` — the page and the thread together, live
7. `npm run kickoff 2026-07` — **only when you mean it.** This one sends.

# Expert Brief — the Fractional Financial Expert

> What Tamoa asks a real finance person to do, what we hand them, what they hand back, and
> how that request maps onto a Terac opportunity. Product context lives in
> [product_demo.md](./product_demo.md); the `ExpertPanel` port that calls this is in
> [architecture.md](./architecture.md).

## 1. The role in one paragraph

A client's books already live in Odoo and Tamoa already reads them. What the client does
*not* have is anyone who looks at the month and says what it means. So once a month we hand
a vetted finance person a packet of that client's real figures, ask for a short written
read on it — cash, cost, revenue, the one thing to fix — and then a **30-minute call with
the client** to walk them through it in plain language.

This is not a CFO retainer and it is not bookkeeping. It's **one bounded engagement per
client per month**, small enough to sell cheaply and specific enough that a good finance
person can do it in about an hour.

**What the client is buying:** the difference between *having* numbers and *understanding*
them. Enough that next month they read their own P&L and see the same things.

> ⚠️ **Scope note.** Terac sources *task labor and expert opinion*, not permanent hires.
> Everything below is written as a per-engagement task for exactly that reason. If we ever
> want the same person every month, that's a relationship we build outside Terac after we
> meet them through it.

---

## 2. What we give the expert (the packet)

**Delivery: a read-only dashboard, one link.** The expert opens a URL and sees the figures
rendered — no PDF attachments, no spreadsheet, no Odoo credentials. That link is the
`task_url` on task 1 (§6), so the packet and the task are the same click.

**For the first run the dashboard shows our own company's real figures**, not a client's.
That removes the consent question entirely and means we're the first customer of our own
product — if the expert's read doesn't tell *us* something we didn't know, the product
doesn't work yet.

The dashboard must show all seven of these, or the deliverables in §3 can't be answered:

| # | Panel | Why they need it |
|---|---|---|
| 1 | **P&L**, current month + trailing 12 | Revenue and cost trend, seasonality |
| 2 | **Balance sheet**, current month-end | Position, debt, what's tied up |
| 3 | **Cash position + 13-week cash view** | The runway question |
| 4 | **AR aging** and **AP aging** | Who owes us, who we owe, and how late |
| 5 | **Top 10 cost lines**, month vs. trailing average | Where the money actually goes |
| 6 | **Company context** | Sector, headcount, business model, what's worrying us, any decision pending (a hire, a lease, a big purchase) |
| 7 | **The agent's own draft read** | So the expert reacts to a position instead of a blank page — and so we get the correction, which is the labeled data we're after |

Item 7 is the one that makes this worth doing twice. Every expert edit to the agent's draft
is a training signal — see `RecordExpertReview` in [architecture.md](./architecture.md).

> 🔒 **The link is the access control.** An unlisted URL handed to three strangers is not
> secret. Keep it read-only, scope it to the one company and the one period, and be ready
> to rotate or expire it after the run.

---

## 3. What we ask back (the deliverables)

### 3a. Written mini-analysis — ~45 min

Not a report. Six short answers, in the client's own vocabulary, every number traceable to
the packet.

1. **The headline.** One sentence: is this month better, worse, or flat, and because of what?
2. **Cash.** Runway in weeks at current burn. The date it gets tight, if it does.
3. **Cost.** The one or two lines that moved most, and whether the move is a problem.
4. **Revenue.** What's actually driving it — mix, volume, price, one big client.
5. **The one thing to fix this month.** A single concrete action with a number attached.
6. **Verdict on the agent's draft** — correct / incomplete / wrong — plus what it missed.

**Rules we state up front, because they're what separates this from generic advice:**

- Plain language. No "EBITDA margin compression." Say what happened and what to do.
- Every claim points at a figure in the packet. No outside assumptions.
- Say "I can't tell from this" when the packet doesn't support an answer. That's a valid
  and useful deliverable, and it tells us what to add to the packet next month.
- Under 500 words. Length is not the value here.

### 3b. The 30-minute client call

Walk the client through §3a live, answer their questions, leave them able to read next
month's numbers themselves. Explicitly **not** a sales call and **not** a compliance,
tax, or legal opinion.

> 🔧 **Implementation gap, stated plainly.** The Terac API does **not** book
> human-moderated calls. We schedule this ourselves: the task carries a `task_url` pointing
> at our own scheduling page (Cal.com), the expert books a slot with the client there, and
> Terac only sees "task completed." Terac is *not* moderating, recording, or verifying that
> call — we are. Anything we want to know about how it went, we have to capture ourselves.

---

## 4. What "good" looks like (our acceptance rubric)

We approve or reject the submission against this. Worth stating in the task description so
the expert is aiming at the same target we're grading with.

| Criterion | Approved | Rejected |
|---|---|---|
| Traceability | Every claim maps to a packet figure | Generic advice that would fit any company |
| Specificity | "Your top client is 41% of revenue and pays at 60 days" | "Watch your concentration risk" |
| Actionability | One action, one number, one deadline | A list of things to "consider" |
| Language | An owner with no finance training follows it | Jargon left unexplained |
| Draft verdict | Says clearly where the agent was wrong | Rubber-stamps the draft |
| Call | Happened, 30 min, client confirms | No-show or under 10 minutes |

---

## 5. Who qualifies

### 5a. Hard filters (checked against the profile before they see the study)

| Filter slug | Operator | Value | Rationale |
|---|---|---|---|
| `multi_select--job_function` | `$in` | `finance`, `accounting-auditing` | They do the work, not adjacent to it |
| `multi_select--seniority` | `$in` | `senior-ic`, `manager`, `senior-manager`, `director`, `vp`, `c-level`, `owner-founder` | Junior IC hasn't owned a P&L |
| `multi_select--language` | `$in` | `en-US` | The call and the write-up are in English |
| `integer--age` | `$gte` | `25` | Proxy for having closed a few years of books |

**No country filter** — decided. Recruiting worldwide gives the largest pool and the
fastest fill, which is what a hackathon timeline needs; the English filter already does
most of the useful narrowing. The cost is time zones: a worldwide panel means the 30-minute
call in §3b may land awkwardly, so the scheduling page needs to offer a wide range of
slots.

**Deliberately NOT filtered:**

- `multi_select--industry: financial-services` — that finds people *employed by banks*, not
  people who read small-business books. Wrong axis; it would cost us good candidates.
- `multi_select--company_size` — this is about the expert's own employer, not the client's.
  Irrelevant, and filtering on it just shrinks the pool.

### 5b. Screener (graded automatically, before Terac's AI voice interview)

Written to test what they'll actually *do*, never naming the answer we want.

**Q1. In a typical month, which of these is closest to work you personally do?**
- *Build or review a full monthly close — P&L, balance sheet, cash* → **qualify**
- *Enter transactions and reconcile accounts against statements* → reject
- *Prepare annual tax filings from books someone else keeps* → reject
- *Work with financial data in a role outside accounting or finance* → reject
- *None of the above* → reject

**Q2. The last time you gave a business owner a read on their numbers, what did they get?**
- *A short written recommendation plus a conversation walking them through it* → **qualify**
- *A set of statements or a dashboard, no commentary* → reject
- *A verbal answer to a specific question, nothing written* → **qualify**
- *I haven't presented financials directly to an owner* → reject
- *None of the above* → reject

**Q3. A company shows €40k in the bank, €95k in receivables with half over 60 days, and
€30k monthly costs. What's the first thing you'd tell the owner?**
- *That collections are the immediate problem and where cash runs out without them* → **qualify**
- *That the balance sheet looks healthy given receivables exceed costs* → reject
- *That they should look into financing options against the receivables* → reject
- *I'd need the full statements before saying anything* → reject
- *None of the above* → reject

> Q3 is the load-bearing one. It's the actual judgment call the job consists of, and the
> three wrong answers are each plausible enough that guessing doesn't work.

**Then Terac's own AI voice interview runs on everyone who passes** — it re-checks these
claims in conversation and is what catches low-effort applicants. It costs no money and it
is not configurable by us, but it does cost **time**, so the recruitment window has to
absorb it.

---

## 6. Terac opportunity shape

The above, expressed as the arguments `terac_create_opportunity` actually takes.

| Field | Value | Note |
|---|---|---|
| `business_type` | `b2b` | We're recruiting professionals for professional work |
| `num_participants` | `3` | Three independent reads on the same figures. Enough to see where experts agree and where the agent's draft was wrong — which is the deliverable |
| `filters` | §5a | |
| `screening_questions` | §5b, all `pick: "one"` | |
| `expected_days_to_complete` | `7` | Calendar days, minimum 5. Nothing in the dashboard shows this back, so it's worth being deliberate |
| `device_types` | `desktop` | Reading statements on a phone is not real |

**Tasks:**

| # | Type | Duration | Review | `task_url` |
|---|---|---|---|---|
| 1 | `activity` | `45` | `manual_review` | ⬜ The read-only dashboard from §2 — **TODO-1** |
| 2 | `interview` | `30` | `manual_review` | ⬜ Our scheduling link, e.g. Cal.com — **TODO-2** (**required** on `interview`) |

`manual_review` on both, deliberately: §4 is a judgment call, and `auto_approve` only pays
automatically when the provider redirects to Terac's completion callback anyway.

### Pricing and funding — read this before launching

- **We don't set the pay.** Terac derives it from participant count × task duration. At 75
  total minutes × 3 participants, this is not a cheap study.
- **Feasibility first — decided.** A draft built without a `feasibility_request_id` carries
  a *machine-estimated* CPI. We run `terac_request_feasibility` to get a human-confirmed
  price, which is then honored exactly at launch, and we set the client price off that real
  number rather than guessing at margin.
- **Current org balance: $25.00.** That will not cover three 75-minute engagements. Top up
  before launching: <https://terac.com/tamoa-msuqm4kq/settings/finance>

**Sequence:** build the draft → request feasibility → confirmed CPI comes back → set the
client price → top up the balance → launch.

### Org handles

| | |
|---|---|
| Organization | **Tamoa** (`tamoa-msuqm4kq`) |
| Default project | `g9gjlif7vhn1r81rzhrtb2kv` |
| Dashboard | <https://terac.com/tamoa-msuqm4kq> |
| All opportunities | <https://terac.com/tamoa-msuqm4kq/opportunities> |

---

## 7. How it plugs into the product

```
Odoo (read-only) ──► agent assembles packet ──► agent writes draft read
                                                        │
                                    EscalationPolicy: material?
                                                        │
                                              Terac opportunity
                                                        │
                                    expert: written analysis ──► 30-min client call
                                                        │
                                    RecordExpertReview ──► labeled example
                                                        │
                                    Stripe engagement invoice, in-thread
```

The before/after delta between the agent's draft (item 7 of the packet) and the expert's
correction is the hackathon deliverable. This brief exists to make that delta measurable.

---

## 8. Decided vs. still open

**Decided:**

| | |
|---|---|
| Geography | No country filter — worldwide, English-only |
| Panel size | 3 experts on the first run |
| Packet | Read-only dashboard, our own company's real figures |
| Client price | Set after `terac_request_feasibility` returns a confirmed CPI |

### TODO — blocks building the draft

Patricio to supply. Paste the value on the line and tick the box.

- [ ] **TODO-1 — Dashboard URL.** Read-only, showing panels 1–7 of §2, scoped to one
      company and one period. Becomes task 1's `task_url`.
      `URL: ______________________`

- [ ] **TODO-2 — Scheduling link** for the 30-minute call (Cal.com or equivalent), with a
      wide slot range because the panel is worldwide. Becomes task 2's `task_url`.
      **Hard blocker:** `task_url` is a *required* field on an `interview` task — no link,
      no draft.
      `URL: ______________________`

- [ ] **TODO-3 — Who the expert meets**, and the name + contact the task description
      carries.
      `Name: ______________  Contact: ______________`

Once all three land: build the draft → `terac_request_feasibility` → confirmed CPI → set
client price → top up balance → launch.

### Assumed unless changed

`expected_days_to_complete: 7` · `device_types: ["desktop"]` · `manual_review` on both
tasks · default project `g9gjlif7vhn1r81rzhrtb2kv`.

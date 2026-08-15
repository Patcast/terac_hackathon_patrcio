// @ts-check
/**
 * The web brief — docs/ui_proposal.md.
 *
 * One module, no framework, no build step. It does three things: draw the app
 * shell, fetch `/api/brief`, and render it.
 *
 * **It formats nothing.** Every figure arrives from the server already rendered
 * by `MoneyFormatter`, so the page and the iMessage thread round the same number
 * the same way, and there is no second currency table in JavaScript to drift
 * from the first. If you find yourself reaching for `toLocaleString` in this
 * file, the value is missing from the view model — add it there.
 */

const DASH = "—";

/* ==========================================================================
   The signal layer.

   These are the modules a full finance-controlling product would have. Exactly
   one of them is live; the rest exist to say the product has a shape. They are
   declared here, in the front end, because that is honestly what they are —
   chrome with no domain meaning behind it.

   The hard rule, from the proposal: a `locked` or `empty` module NEVER renders
   a number. The whole claim of this product is that Tammy does not invent
   figures, and one plausible-looking fake chart behind a nav item undoes it.
   ========================================================================== */

const MODULES = [
  {
    group: "This month",
    items: [
      { id: "brief", label: "Monthly Report", state: "live", icon: "report" },
      { id: "cash-flow", label: "Cash Flow", state: "locked", icon: "flow" },
      { id: "receivables", label: "Receivables", state: "locked", icon: "in" },
      { id: "payables", label: "Payables", state: "locked", icon: "out" },
    ],
  },
  {
    group: "Control",
    items: [
      { id: "expenses", label: "Expenses & Categories", state: "locked", icon: "tag" },
      { id: "budget", label: "Budget vs Actual", state: "locked", icon: "target" },
      { id: "scenarios", label: "Scenarios & Runway", state: "locked", icon: "branch" },
      { id: "tax", label: "Tax Position", state: "locked", icon: "receipt" },
    ],
  },
  {
    group: "People",
    items: [
      { id: "calls", label: "Expert Calls", state: "empty", icon: "call" },
      { id: "documents", label: "Documents", state: "locked", icon: "doc" },
    ],
  },
  {
    group: "Setup",
    items: [
      { id: "odoo", label: "Odoo Connection", state: "empty", icon: "plug" },
      { id: "team", label: "Team & Alerts", state: "locked", icon: "users" },
      { id: "settings", label: "Settings", state: "locked", icon: "gear" },
    ],
  },
];

const ICONS = {
  report: "M4 3h8l4 4v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm8 0v4h4M6 11h8M6 14h5",
  flow: "M3 15c3 0 3-10 6-10s3 10 6 10M3 15h14",
  in: "M10 3v9m0 0 3.5-3.5M10 12 6.5 8.5M3 16h14",
  out: "M10 12V3m0 0L6.5 6.5M10 3l3.5 3.5M3 16h14",
  tag: "M3 8.5V4a1 1 0 0 1 1-1h4.5L17 11.5 11.5 17 3 8.5Zm3-2.5h.01",
  target: "M10 3v3m0 8v3m7-7h-3M6 10H3m10.5 0a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z",
  branch: "M6 3v6a3 3 0 0 0 3 3h5m0 0-3-3m3 3-3 3M6 15V9",
  receipt: "M5 3h10v14l-2.5-1.5L10 17l-2.5-1.5L5 17V3Zm3 4h4M8 10h4",
  call: "M4 4h3l1.5 3.5-2 1.5a9 9 0 0 0 4.5 4.5l1.5-2L16 13v3h-1A11 11 0 0 1 4 5V4Z",
  doc: "M5 3h6l4 4v10H5V3Zm6 0v4h4M7.5 11h5M7.5 14h3",
  plug: "M7 3v4m6-4v4M4.5 7h11v3a5.5 5.5 0 0 1-11 0V7Zm5.5 8.5V18",
  users: "M7.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm6.5 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM3 16c0-2.2 2-3.5 4.5-3.5S12 13.8 12 16m2-3.4c1.9.2 3 1.4 3 3.4",
  gear: "M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm7-2.5-1.8-.5-.5-1.2.9-1.6-1.3-1.3-1.6.9-1.2-.5L11 4H9l-.5 1.8-1.2.5-1.6-.9L4.4 6.7l.9 1.6-.5 1.2L3 10v2l1.8.5.5 1.2-.9 1.6 1.3 1.3 1.6-.9 1.2.5L9 18h2l.5-1.8 1.2-.5 1.6.9 1.3-1.3-.9-1.6.5-1.2L17 12v-2Z",
  lock: "M5.5 8.5V6a4.5 4.5 0 0 1 9 0v2.5M4 8.5h12v8H4v-8Z",
};

/* ==========================================================================
   Tiny DOM helpers.

   `el` sets text through `textContent`, never `innerHTML`. Company names,
   invoice numbers and an expert's free-typed note all reach this page, and the
   safe path has to be the default one rather than the one you remember.
   ========================================================================== */

/**
 * @param {string} tag
 * @param {Record<string, unknown>} [props]
 * @param {...(Node|string|null|undefined|false)} children
 */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.className = String(value);
    else if (key === "text") node.textContent = String(value);
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), /** @type {any} */ (value));
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * An inline icon.
 *
 * `createElementNS`, not `createElement`: an `<svg>` built through the HTML
 * factory is an `HTMLUnknownElement` that lays out as nothing at all, and the
 * failure is silent — the icon simply never appears.
 *
 * @param {string} d @param {string} className @param {number} [weight]
 */
function svgPath(d, className, weight = 1.5) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", String(weight));
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);
  svg.append(path);
  return svg;
}

/** @param {keyof ICONS | string} name */
function icon(name, className = "nav-icon") {
  return svgPath(ICONS[/** @type {keyof ICONS} */ (name)] ?? ICONS.doc, className);
}

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * Replaces a container's contents, dropping the nulls a conditional block
 * produces. `replaceChildren` itself rejects them, and every section on this
 * page is conditional on a part of the book having come back.
 *
 * @param {HTMLElement} host
 * @param {...(Node|null|undefined|false)} children
 */
function mount(host, ...children) {
  host.replaceChildren(...children.filter((child) => child instanceof Node));
}

/* ==========================================================================
   State
   ========================================================================== */

const params = new URLSearchParams(location.search);
const query = new URLSearchParams();
if (params.get("client")) query.set("client", String(params.get("client")));
if (params.get("month")) query.set("month", String(params.get("month")));

/** @type {any} */
let brief = null;
/** @type {any} */
let settings = { booking: null, payment: null, price: null, fixtures: false };
let current = "brief";
/** @type {"after"|"before"} */
let reviewFace = "after";

/* ==========================================================================
   Shell
   ========================================================================== */

function renderNav() {
  const nav = $("nav");
  nav.replaceChildren();

  for (const section of MODULES) {
    nav.append(el("div", { class: "nav-group", text: section.group }));
    for (const item of section.items) {
      const button = el(
        "button",
        {
          class: "nav-item",
          type: "button",
          "data-state": item.state,
          "data-id": item.id,
          ...(item.state === "locked"
            ? { title: "Not enabled on this workspace", "aria-disabled": "true" }
            : {}),
          ...(item.id === current ? { "aria-current": "page" } : {}),
          onclick: () => select(item),
        },
        icon(item.icon),
        el("span", { class: "nav-label", text: item.label }),
        item.state === "live" ? el("span", { class: "nav-live", text: "LIVE" }) : null,
        item.state === "locked" ? icon("lock", "nav-lock") : null,
      );
      nav.append(button);
    }
  }
}

/** @param {{id:string,label:string,state:string}} item */
function select(item) {
  if (item.state === "locked") {
    // The honest response. Not a fake page, not a dead click.
    toast(`${item.label} isn't enabled on this workspace.`);
    return;
  }
  current = item.id;
  $("crumb").textContent = item.label;
  closeSidebar();
  renderNav();
  if (item.id === "brief") renderBrief();
  else if (item.id === "calls") renderExpertCalls();
  else if (item.id === "odoo") renderOdoo();
  $("main").scrollIntoView({ block: "start" });
}

let toastTimer = 0;
/** @param {string} message */
function toast(message) {
  const node = $("toast");
  node.textContent = message;
  node.hidden = false;
  requestAnimationFrame(() => node.setAttribute("data-visible", "true"));
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    node.removeAttribute("data-visible");
    setTimeout(() => (node.hidden = true), 200);
  }, 2600);
}

function closeSidebar() {
  $("sidebar").removeAttribute("data-open");
  $("scrim").hidden = true;
  $("menu-toggle").setAttribute("aria-expanded", "false");
}

function wireShell() {
  $("theme-toggle").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("tamoa-theme", next);
    } catch {}
  });

  $("menu-toggle").addEventListener("click", () => {
    const open = $("sidebar").getAttribute("data-open") === "true";
    if (open) closeSidebar();
    else {
      $("sidebar").setAttribute("data-open", "true");
      $("scrim").hidden = false;
      $("menu-toggle").setAttribute("aria-expanded", "true");
    }
  });

  $("scrim").addEventListener("click", closeSidebar);

  // Chrome that is deliberately inert — the company switcher, the period
  // picker, the search box. They say the product has these; they do not have
  // them yet, and they say so when pressed rather than doing nothing.
  document.addEventListener("click", (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const inert = target.closest("[data-inert-control]");
    if (inert) toast(inert.getAttribute("data-inert-message") ?? "Not enabled on this workspace.");
  });
}

/* ==========================================================================
   The live screen
   ========================================================================== */

function skeleton() {
  const bar = (/** @type {string} */ w, /** @type {string} */ h) =>
    el("div", { class: "skeleton", style: `width:${w};height:${h}` });

  mount(
    $("main"),
    el(
      "div",
      { class: "page-head" },
      el("div", {}, bar("220px", "30px"), el("div", { style: "height:8px" }), bar("300px", "15px")),
    ),
    el(
      "div",
      { class: "section" },
      el(
        "div",
        { class: "tiles" },
        ...[0, 1, 2, 3].map(() =>
          el(
            "div",
            { class: "card tile" },
            bar("60px", "11px"),
            el("div", { style: "height:12px" }),
            bar("120px", "26px"),
            el("div", { style: "height:10px" }),
            bar("90px", "12px"),
          ),
        ),
      ),
    ),
    el("div", { class: "section" }, el("div", { class: "card", style: "height:76px" })),
    el("div", { class: "section" }, el("div", { class: "card", style: "height:220px" })),
  );
}

/**
 * @param {{ quiet?: boolean }} [options] `quiet` refreshes in place — used after
 * recording a review, where flashing the skeleton would throw away the reader's
 * scroll position for a request that takes milliseconds.
 */
async function renderBrief(options = {}) {
  if (!options.quiet) skeleton();

  let payload;
  try {
    const response = await fetch(`/api/brief?${query}`, { headers: { accept: "application/json" } });
    payload = await response.json();
    if (!response.ok) {
      // The server hands back the same copy Tammy texts when a ledger can't be
      // read. Showing it verbatim is the point: one voice, both surfaces.
      showProblem(payload?.error ?? "This brief isn't available.");
      return;
    }
  } catch {
    showProblem("Couldn't reach the server. The page is up; the ledger isn't answering.");
    return;
  }

  brief = payload;
  applyIdentity(brief);
  paint();
}

/** @param {string} message */
function showProblem(message) {
  $("main").replaceChildren(
    el(
      "div",
      { class: "module-empty" },
      el("div", { class: "module-icon" }, icon("report", "")),
      el("h2", { text: "No brief to show" }),
      el("p", { text: message }),
      el("button", {
        class: "button",
        type: "button",
        text: "Try again",
        onclick: () => renderBrief(),
      }),
    ),
  );
}

/** @param {any} data */
function applyIdentity(data) {
  const name = data.company || "Your company";
  $("company-name").textContent = name;
  document.title = `${name} — ${data.monthLabel} · Tamoa`;

  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((/** @type {string} */ w) => w[0] ?? "")
    .join("")
    .toUpperCase();
  $("company-mark").textContent = initials || "··";
  $("avatar").textContent = initials || "··";
}

function paint() {
  const data = brief;
  mount(
    $("main"),
    pageHead(data),
    section("The month", tiles(data.tiles)),
    data.watch ? section("Watching", watchCard(data.watch)) : null,
    section(
      `Against the last ${data.trend.length} months`,
      el("div", {}, signalsCard(data.signals), el("div", { style: "height:12px" }), stripCard(data)),
      "Every figure beside its own history — a month on its own says less.",
    ),
    section("Who still owes you", receivablesCard(data.receivables)),
    section("The conversation", reviewCard(data.review)),
    section("The call", actionsCard(data)),
    provenance(data.footer),
  );
}

/** @param {string} title @param {Node} body @param {string} [note] */
function section(title, body, note) {
  return el(
    "section",
    { class: "section" },
    el(
      "div",
      { class: "section-head" },
      el("h3", { class: "section-title", text: title }),
      note ? el("span", { class: "section-note", text: note }) : null,
    ),
    body,
  );
}

/** @param {any} data */
function pageHead(data) {
  return el(
    "div",
    { class: "page-head" },
    el(
      "div",
      {},
      el("h1", { class: "page-title", text: data.monthLabel }),
      el("p", {
        class: "page-sub",
        text: `${data.company} · prepared by Tammy for your fractional CFO call`,
      }),
    ),
    el(
      "div",
      { class: "head-side" },
      el(
        "div",
        {
          class: "period",
          "data-inert-control": "",
          "data-inert-message": "Month switching lands with the next release.",
        },
        el("button", { type: "button", text: "‹", "aria-label": "Previous month" }),
        el("button", { type: "button", class: "period-current", text: data.monthKey }),
        el("button", { type: "button", text: "›", "aria-label": "Next month" }),
      ),
      el("span", { class: "pill", "data-tone": data.state.tone, text: data.state.label }),
    ),
  );
}

/** @param {any[]} list */
function tiles(list) {
  return el(
    "div",
    { class: "tiles" },
    ...list.map((tile) =>
      el(
        "div",
        { class: "card tile" },
        el("div", { class: "tile-label", text: tile.label }),
        el("div", { class: "tile-value", text: tile.value }),
        el("div", {
          class: "tile-caption",
          "data-tone": tile.captionTone,
          text: tile.caption ?? " ",
        }),
      ),
    ),
  );
}

/** @param {any} watch */
function watchCard(watch) {
  const glyph = watch.clear
    ? "M4 10.5 8 14.5l8-9"
    : "M10 3.5 18 17H2l8-13.5ZM10 8.5v3.5m0 2.5h.01";

  return el(
    "div",
    { class: "card watch", "data-clear": String(watch.clear) },
    svgPath(glyph, "watch-icon", 1.7),
    el(
      "div",
      {},
      el("p", { class: "watch-headline", text: watch.headline }),
      watch.detail ? el("p", { class: "watch-detail", text: watch.detail }) : null,
    ),
  );
}

/** @param {any[]} signals */
function signalsCard(signals) {
  if (signals.length === 0) {
    return el(
      "div",
      { class: "card" },
      emptyBlock("No cost history yet", "The month-by-month breakdown didn't come back."),
    );
  }

  return el(
    "div",
    { class: "card signals" },
    ...signals.map((signal) =>
      el(
        "div",
        { class: "signal" },
        el(
          "div",
          { class: "signal-name" },
          el("b", { text: signal.account }),
          signal.code ? el("span", { class: "signal-code", text: signal.code }) : null,
        ),
        signal.share ? el("div", { class: "signal-share", text: signal.share }) : null,
        el(
          "div",
          { class: "signal-figures" },
          el("div", { class: "signal-amount", text: signal.amount }),
          signal.baseline ? el("small", { class: "signal-baseline", text: signal.baseline }) : null,
        ),
        el("span", { class: "verdict", "data-tone": signal.tone, text: signal.verdict }),
      ),
    ),
  );
}

/**
 * The thirteen-month strip.
 *
 * Two rows of bars over real `TrailingMonths` data — no chart library, no axis
 * to invent. Heights are percentages of the largest absolute value in each row,
 * which is the only scaling decision here and the only one that can be wrong.
 *
 * @param {any} data
 */
function stripCard(data) {
  /** @type {any[]} */
  const points = data.trend;
  if (points.length === 0) return el("div", { class: "card" });

  const cols = points.length;
  const peakRevenue = Math.max(...points.map((p) => Math.abs(p.revenue)), 1);
  const peakNet = Math.max(...points.map((p) => Math.abs(p.net)), 1);

  const revenueRow = el(
    "div",
    { class: "strip-row", style: `--cols:${cols}` },
    ...points.map((point) =>
      el(
        "div",
        {
          class: "strip-col",
          "data-anchor": String(point.anchor),
          title: `${point.revenueLabel} · ${point.netLabel}`,
        },
        el("div", {
          class: "strip-bar",
          style: `height:${Math.max(2, (Math.abs(point.revenue) / peakRevenue) * 100)}%`,
        }),
      ),
    ),
  );

  const netRow = el(
    "div",
    { class: "strip-row signed", style: `--cols:${cols}` },
    ...points.map((point) => {
      const height = `${Math.max(2, (Math.abs(point.net) / peakNet) * 100)}%`;
      const positive = point.net >= 0;
      return el(
        "div",
        {
          class: "strip-col",
          "data-anchor": String(point.anchor),
          title: `${point.revenueLabel} · ${point.netLabel}`,
        },
        el(
          "div",
          { class: "strip-half up" },
          positive ? el("div", { class: "strip-bar-signed", style: `height:${height}` }) : null,
        ),
        el(
          "div",
          { class: "strip-half down" },
          positive ? null : el("div", { class: "strip-bar-signed", style: `height:${height}` }),
        ),
      );
    }),
    el("div", { class: "strip-midline" }),
  );

  const axis = el(
    "div",
    { class: "strip-axis", style: `--cols:${cols}` },
    ...points.map((point) => el("span", { "data-anchor": String(point.anchor), text: point.label })),
  );

  return el(
    "div",
    { class: "card strip" },
    el(
      "div",
      { class: "strip-head" },
      el("div", { class: "section-title", text: "Revenue and net, by month" }),
      el(
        "div",
        { class: "strip-legend" },
        el("span", {}, el("i", {}), "revenue"),
        el("span", {}, el("i", { class: "swatch-pos" }), "net +"),
        el("span", {}, el("i", { class: "swatch-neg" }), "net −"),
      ),
    ),
    el("div", { class: "strip-rows" }, revenueRow, netRow),
    axis,
  );
}

/** @param {any} ar */
function receivablesCard(ar) {
  if (ar.rows.length === 0) {
    return el(
      "div",
      { class: "card" },
      emptyBlock("Nothing open", "Every invoice raised up to this month end was settled."),
    );
  }

  return el(
    "div",
    { class: "card" },
    el(
      "dl",
      { class: "ar-summary" },
      figure("Open", ar.total ?? DASH),
      figure(ar.overdueLabel, ar.overdue ?? DASH, "negative"),
      figure("Invoices", String(ar.count)),
    ),
    ...ar.rows.map((/** @type {any} */ row) =>
      el(
        "div",
        { class: "ar-row", "data-overdue": String(row.overdue) },
        el("div", { class: "ar-party", text: row.party }),
        el("div", { class: "ar-number", text: row.number }),
        el("div", { class: "ar-amount", text: row.amount }),
        el("div", { class: "ar-age", text: row.age }),
      ),
    ),
    ar.count > ar.rows.length
      ? el("div", {
          class: "ar-row",
          style: "color:var(--faint)",
          text: `+ ${ar.count - ar.rows.length} more open invoices`,
        })
      : null,
  );
}

/** @param {string} label @param {string} value @param {string} [tone] */
function figure(label, value, tone) {
  return el(
    "div",
    { class: "ar-figure", "data-tone": tone },
    el("dt", { text: label }),
    el("dd", { text: value }),
  );
}

/**
 * Before → after. The hackathon's human loop, and the block with the strictest
 * rule on the page: with no expert note recorded it shows an empty state, never
 * the agent's own take relabelled as reviewed.
 *
 * @param {any} review
 */
function reviewCard(review) {
  if (!review.reviewed) {
    return el(
      "div",
      { class: "card review" },
      emptyBlock(
        "Not reviewed yet",
        "Tammy's take goes to a fractional CFO before the call. Once they've read it, " +
          "the before and after both appear here.",
      ),
      el(
        "div",
        { style: "display:flex;justify-content:center;margin-top:4px" },
        el("button", {
          class: "button button-ghost",
          type: "button",
          text: "Record expert review",
          onclick: (/** @type {Event} */ event) => {
            const form = /** @type {HTMLElement} */ (
              /** @type {HTMLElement} */ (event.target).closest(".review")?.querySelector(
                ".review-form",
              )
            );
            if (form) {
              form.setAttribute("data-open", "true");
              /** @type {HTMLTextAreaElement|null} */ (form.querySelector("textarea"))?.focus();
            }
          },
        }),
      ),
      reviewForm(),
    );
  }

  const showing = reviewFace === "before" ? review.before : review.after;
  return el(
    "div",
    { class: "card review" },
    el(
      "div",
      { class: "segmented", role: "group", "aria-label": "Review" },
      faceButton("before", "Before"),
      faceButton("after", "After review"),
    ),
    el("p", { class: "review-body", text: showing ?? DASH }),
    el("p", {
      class: "review-meta",
      text:
        reviewFace === "after"
          ? `Updated by ${review.author ?? "a reviewer"}${review.recordedAt ? ` · ${review.recordedAt}` : ""}`
          : "Tammy's first take, before a human read it",
    }),
  );
}

/** @param {"before"|"after"} face @param {string} label */
function faceButton(face, label) {
  return el("button", {
    type: "button",
    text: label,
    "aria-pressed": String(reviewFace === face),
    onclick: () => {
      reviewFace = face;
      paint();
    },
  });
}

function reviewForm() {
  const before = el("textarea", {
    id: "review-before",
    placeholder: "Tammy's take, as it stood…",
  });
  const after = el("textarea", {
    id: "review-after",
    placeholder: "What you'd change — the missing risk, the tighter call…",
  });
  const author = el("input", { id: "review-author", placeholder: "Your name" });

  return el(
    "div",
    { class: "review-form" },
    el("label", { for: "review-before", text: "Before — the agent's take" }),
    before,
    el("label", { for: "review-after", text: "After — your revision" }),
    after,
    el("label", { for: "review-author", text: "Reviewed by" }),
    author,
    el(
      "div",
      { style: "display:flex;gap:8px" },
      el("button", {
        class: "button button-primary",
        type: "button",
        text: "Save review",
        onclick: async () => {
          const body = {
            before: /** @type {HTMLTextAreaElement} */ (before).value,
            after: /** @type {HTMLTextAreaElement} */ (after).value,
            author: /** @type {HTMLInputElement} */ (author).value,
          };
          if (!body.before.trim() || !body.after.trim()) {
            toast("Both the before and the after are needed.");
            return;
          }
          const response = await fetch(`/api/brief/review?${query}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!response.ok) {
            toast("Couldn't save that review.");
            return;
          }
          reviewFace = "after";
          toast("Review recorded.");
          await renderBrief({ quiet: true });
          document.querySelector(".review")?.scrollIntoView({ block: "center" });
        },
      }),
    ),
  );
}

/** @param {any} data */
function actionsCard(data) {
  const decision = data.watch?.clear
    ? "Nothing forced this month — use the call for what's next"
    : "Bring the watch item above to the call";

  return el(
    "div",
    { class: "card actions" },
    el(
      "div",
      { class: "decision" },
      el("div", { class: "decision-label", text: "Suggested agenda" }),
      el("p", { class: "decision-text", text: decision }),
    ),
    linkButton(settings.booking, "Book 20 min with a CFO", "button button-primary", "Booking link not configured"),
    linkButton(
      settings.payment,
      settings.price ? `Pay ${settings.price}` : "Pay for the session",
      "button",
      "Payment link not configured",
    ),
  );
}

/** @param {string|null} href @param {string} label @param {string} className @param {string} missing */
function linkButton(href, label, className, missing) {
  if (!href) {
    return el("span", {
      class: className,
      "aria-disabled": "true",
      title: missing,
      text: label,
    });
  }
  return el("a", { class: className, href, target: "_blank", rel: "noopener", text: label });
}

/** @param {any} footer */
function provenance(footer) {
  return el(
    "footer",
    { class: "provenance" },
    el("div", {}, el("b", { text: "Source: " }), footer.provenance),
    footer.settling ? el("div", { class: "warn", text: footer.settling }) : null,
    footer.gaps ? el("div", { class: "warn", text: footer.gaps }) : null,
  );
}

/* ==========================================================================
   The two modules that route but hold nothing.

   They exist to prove the shell is real. Neither shows a figure it made up —
   what they show is what we actually know: how we're connected, and that no
   call has happened yet.
   ========================================================================== */

/** @param {string} title @param {string} body */
function emptyBlock(title, body) {
  return el("div", { class: "empty" }, el("h4", { text: title }), el("p", { text: body }));
}

function renderExpertCalls() {
  $("main").replaceChildren(
    el(
      "div",
      { class: "module-empty" },
      el("div", { class: "module-icon" }, icon("call", "")),
      el("h2", { text: "No calls booked yet" }),
      el("p", {
        text:
          "When you book a fractional CFO from the thread, the call and the brief it was " +
          "prepared from show up here.",
      }),
      linkButton(
        settings.booking,
        "Book 20 min with a CFO",
        "button button-primary",
        "Booking link not configured",
      ),
    ),
  );
}

function renderOdoo() {
  const facts = el(
    "dl",
    { class: "card facts" },
    fact("Ledger", settings.fixtures ? "Demo fixtures" : "Odoo"),
    fact("Access", "Read-only"),
    fact("Messaging", settings.messaging ? "Connected" : "Not configured"),
    fact("Company", brief?.company ?? DASH),
    fact("Currency", brief?.currency ?? DASH),
    fact("Latest settled month", brief?.monthLabel ?? DASH),
  );

  $("main").replaceChildren(
    el(
      "div",
      { class: "module-empty" },
      el("div", { class: "module-icon" }, icon("plug", "")),
      el("h2", { text: "Odoo connection" }),
      el("p", {
        text:
          "Tamoa reads your books and never writes to them. There is no journal entry, " +
          "no reconciliation and no field on your ledger that this product can change.",
      }),
      facts,
    ),
  );
}

/** @param {string} label @param {string} value */
function fact(label, value) {
  return el("div", { class: "fact" }, el("dt", { text: label }), el("dd", { text: value }));
}

/* ==========================================================================
   Boot
   ========================================================================== */

async function main() {
  wireShell();
  renderNav();
  skeleton();

  try {
    const response = await fetch("/api/settings");
    if (response.ok) settings = await response.json();
  } catch {
    // The brief is the page; the booking link is a nicety. Carry on without it.
  }

  const state = $("ledger-state");
  state.setAttribute("data-live", settings.fixtures ? "fixtures" : "true");
  $("ledger-label").textContent = settings.fixtures ? "Demo ledger" : "Odoo · read-only";

  await renderBrief();
}

main();

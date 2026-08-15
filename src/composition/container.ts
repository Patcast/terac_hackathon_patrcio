import { fileURLToPath } from "node:url";

import { phase1Config, type Phase1Config } from "../config/env.js";

import { ClientId } from "../domain/model/Ids.js";
import { AgingAnalyzer } from "../domain/services/AgingAnalyzer.js";
import { AnswerValidator } from "../domain/services/AnswerValidator.js";
import { HighlightSelector } from "../domain/services/HighlightSelector.js";
import { RunwayEstimator } from "../domain/services/RunwayEstimator.js";

import type { AccountingRepository } from "../application/ports/driven/AccountingRepository.js";
import type { Clock } from "../application/ports/driven/Clock.js";
import type { ClientRegistry } from "../application/ports/driven/ClientRegistry.js";
import type { ConversationChannel } from "../application/ports/driven/ConversationChannel.js";
import type { ReviewNotes } from "../application/ports/driven/ReviewNotes.js";
import { AnswerMonthlyQuestion } from "../application/usecases/AnswerMonthlyQuestion.js";
import { BuildMonthlyReport } from "../application/usecases/BuildMonthlyReport.js";

import { SystemClock } from "../adapters/outbound/SystemClock.js";
import {
  CachingAccountingRepository,
  InMemoryStore,
} from "../adapters/outbound/accounting/CachingAccountingRepository.js";
import { MonthlyBookAssembler } from "../adapters/outbound/accounting/MonthlyBookAssembler.js";
import { InMemoryClientRegistry } from "../adapters/outbound/registry/InMemoryClientRegistry.js";

import { InMemoryReviewNotes } from "../adapters/outbound/review/InMemoryReviewNotes.js";

import { OdooJsonApiClient } from "../adapters/outbound/odoo/OdooJsonApiClient.js";
import { OdooMapper } from "../adapters/outbound/odoo/OdooMapper.js";
import { OdooCompanyContext } from "../adapters/outbound/odoo/OdooCompanyContext.js";
import { OdooAccountingRepository } from "../adapters/outbound/odoo/OdooAccountingRepository.js";
import { odooReportCatalogue } from "../adapters/outbound/odoo/reports/index.js";
import { DEMO_CLIENT_ID } from "../adapters/outbound/odoo/fixtures/demoBook.js";
import { FixtureBookRepository } from "../adapters/outbound/odoo/fixtures/FixtureBookRepository.js";

import { ClaudeReasoningEngine } from "../adapters/outbound/claude/ClaudeReasoningEngine.js";
import { LinqConversationChannel } from "../adapters/outbound/linq/LinqConversationChannel.js";
import { LinqWebhookController } from "../adapters/inbound/linq/LinqWebhookController.js";
import { BriefController, type BriefAudience } from "../adapters/inbound/web/BriefController.js";
import { StaticFiles } from "../adapters/inbound/web/StaticFiles.js";

import { IMessageAnswerPresenter } from "../presentation/presenters/IMessageAnswerPresenter.js";
import { MonthlyReportPresenter } from "../presentation/presenters/MonthlyReportPresenter.js";
import { MoneyFormatter } from "../presentation/presenters/MoneyFormatter.js";

/**
 * The composition root — **the only place in the codebase that calls `new` on
 * something it did not define** (docs/architecture_phase1.md §12).
 *
 * The report catalogue is a list, so adding a sixteenth report is one file plus
 * one line. Nothing here makes a decision; it wires things that do.
 *
 * It builds in two halves. The **brief** half needs a ledger and nothing else;
 * the **thread** half additionally needs Claude and Linq, whose `fromEnv()`
 * calls fail loudly on a missing key. Splitting them is what lets the web
 * surface boot on a laptop with no credentials at all — see `buildBriefContainer`.
 */
export interface BriefContainer {
  report: BuildMonthlyReport;
  /** The web brief — `docs/ui_proposal.md`. */
  brief: BriefController;
  web: StaticFiles;
  clients: ClientRegistry;
  reviews: ReviewNotes;
  accounting: AccountingRepository;
  clock: Clock;
  config: Phase1Config;
}

export interface Container extends BriefContainer {
  answer: AnswerMonthlyQuestion;
  channel: ConversationChannel;
  presenter: IMessageAnswerPresenter;
  webhook: LinqWebhookController;
}

/**
 * Everything the web brief needs, and deliberately nothing more.
 *
 * **No `ANTHROPIC_API_KEY`, no `LINQ_API_KEY`.** The brief is arithmetic over a
 * book — there is no model call on the page's path — so requiring the messaging
 * credentials to serve it would be a boot failure invented for no reason. With
 * `USE_FIXTURES=true` it needs no Odoo credentials either, which is the
 * difference between a demo that survives a bad network and one that doesn't.
 */
export function buildBriefContainer(config: Phase1Config = phase1Config()): BriefContainer {
  const clock = new SystemClock();
  const clients = InMemoryClientRegistry.fromJson(config.clientRegistryJson);

  // `USE_FIXTURES` is the highest-value line in this file (§12): it is what lets
  // the demo run when Odoo's API surprises you on the morning of.
  const ledger = config.useFixtures
    ? new FixtureBookRepository(config.settlingDays)
    : odooLedger(config, clock, clients);

  const accounting = config.bookCacheEnabled
    ? new CachingAccountingRepository(ledger, new InMemoryStore(clock), clock, config.settlingDays)
    : ledger;

  // The brief runs off the same repository as the thread — same book, same
  // cache, so the page and the text message can never quote different numbers
  // for the same month (docs/ui_proposal.md §5).
  const reviews = new InMemoryReviewNotes();
  const report = new BuildMonthlyReport(
    accounting,
    new RunwayEstimator(),
    new HighlightSelector(),
    new AgingAnalyzer(),
    reviews,
    clock,
    config.settlingDays,
  );

  const brief = new BriefController(
    report,
    new MonthlyReportPresenter(new MoneyFormatter()),
    reviews,
    briefAudience(clients, config),
    clock,
    config.settlingDays,
  );

  return {
    report,
    brief,
    web: new StaticFiles(fileURLToPath(new URL("../../web/", import.meta.url))),
    clients,
    reviews,
    accounting,
    clock,
    config,
  };
}

/** The whole system: the brief half, plus the thread that needs Claude and Linq. */
export function buildContainer(config: Phase1Config = phase1Config()): Container {
  const base = buildBriefContainer(config);
  const { accounting, clients, clock } = base;

  const answer = new AnswerMonthlyQuestion(
    clients,
    accounting,
    ClaudeReasoningEngine.fromEnv(),
    new AnswerValidator(),
    new RunwayEstimator(),
    clock,
    config.settlingDays,
  );

  const channel = LinqConversationChannel.fromEnv();
  const presenter = new IMessageAnswerPresenter(new MoneyFormatter());

  return {
    ...base,
    answer,
    channel,
    presenter,
    webhook: new LinqWebhookController(clients, answer, presenter, channel, clock),
  };
}

/**
 * Who the brief may be published for — the whole of Phase 1's access control,
 * and the reason `?client=` cannot enumerate an Odoo database.
 *
 * The fixture client is added only under `USE_FIXTURES`, which is what lets a
 * fresh clone with no `CLIENT_REGISTRY_JSON` open the page and see Blackthorn
 * Studio's July. With fixtures off, the list is exactly the registry.
 */
function briefAudience(clients: ClientRegistry, config: Phase1Config): BriefAudience {
  const served = new Set(clients.all().map((client) => client.id.value));
  if (config.useFixtures) served.add(DEMO_CLIENT_ID.value);

  const fallback = clients.all()[0]?.id ?? (config.useFixtures ? DEMO_CLIENT_ID : null);

  return {
    default: () => fallback,
    resolve: (requested) => (served.has(requested) ? ClientId.of(requested) : null),
  };
}

/** The live path: one Odoo client, one mapper, fifteen reports, one assembler. */
function odooLedger(config: Phase1Config, clock: Clock, clients: ClientRegistry) {
  const rpc = OdooJsonApiClient.fromEnv();
  const mapper = new OdooMapper();
  const company = new OdooCompanyContext(rpc);

  const assembler = new MonthlyBookAssembler(odooReportCatalogue(rpc, mapper, company), clock, {
    concurrency: config.reportConcurrency,
    perReportMs: config.reportTimeoutMs,
    trailingMonths: config.trailingMonths,
    settlingDays: config.settlingDays,
  });

  // Which Odoo company a client's books live in is registry knowledge, and an
  // outbound adapter reaching into `application/` for it would invert the one
  // rule — so it is injected here, where both sides are already in scope.
  return new OdooAccountingRepository(assembler, (clientId) => {
    const client = clients.all().find((candidate) => candidate.id.equals(clientId));
    return client?.odooCompanyId ?? null;
  });
}

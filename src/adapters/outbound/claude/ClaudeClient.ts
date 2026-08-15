import Anthropic from "@anthropic-ai/sdk";
import { claudeConfig, type ClaudeConfig } from "../../../config/env.js";
import { failed, ok, type ConnectivityResult } from "../connectivity.js";

/** The reasoning model Tamoa runs on. See docs/tech_stack.md §4. */
export const CLAUDE_MODEL = "claude-opus-5";

const SERVICE = "Claude";

/**
 * A single reasoning call, split at the cache breakpoint.
 *
 * The split is the whole point: `system` and `cachedPrefix` are identical on
 * every question about a given client, so a `cache_control` marker after the
 * prefix means a follow-up reads them at ~0.1× input price
 * (docs/tech_stack.md §4, docs/architecture_phase1.md §11).
 */
export interface ReasoningCall {
  system: string;
  /** Stable across requests — the breakpoint lands immediately after this. */
  cachedPrefix: string;
  /** The month's numbers, the question, and the answer protocol. */
  volatile: string;
  effort: "low" | "medium" | "high";
  maxTokens?: number;
}

/**
 * Room for the answer *and* for thinking, which is on by default on Opus 5 and
 * bills against the same budget. A truncated reply loses its citation trailer,
 * which is a grounding failure rather than a formatting one — so this is set
 * high enough that `max_tokens` never binds on a text-message-length answer.
 */
const DEFAULT_MAX_TOKENS = 8_192;

/**
 * Thin wrapper over the Anthropic SDK — the only place in the codebase that
 * constructs an `Anthropic` client. `ClaudeReasoningEngine` (the port
 * implementation, per docs/architecture.md §6) will be built on top of this.
 */
export class ClaudeClient {
  private constructor(private readonly sdk: Anthropic) {}

  static fromEnv(config: ClaudeConfig = claudeConfig()): ClaudeClient {
    return new ClaudeClient(new Anthropic({ apiKey: config.apiKey }));
  }

  /** Escape hatch for callers that need the raw SDK surface. */
  get raw(): Anthropic {
    return this.sdk;
  }

  /**
   * One-shot completion. Deliberately minimal — the tool-use loop stays in the
   * application layer (architecture.md §6), not in here.
   */
  async complete(prompt: string, maxTokens = 1024): Promise<string> {
    const response = await this.sdk.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    });

    if (response.stop_reason === "refusal") {
      throw new Error(
        `Claude refused the request (${response.stop_details?.category ?? "no category"})`,
      );
    }

    return response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
  }

  /**
   * The call `ClaudeReasoningEngine` makes: one turn, two content blocks, a
   * cache breakpoint between them.
   *
   * No `temperature`, `top_p` or `budget_tokens` — all return 400 on Opus 5
   * (docs/tech_stack.md §4). Depth is steered with `output_config.effort`, and
   * thinking is left on: this is the one call in the product where reasoning
   * over a ledger is the job.
   */
  async reason(call: ReasoningCall): Promise<string> {
    const response = await this.sdk.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: call.maxTokens ?? DEFAULT_MAX_TOKENS,
      output_config: { effort: call.effort },
      system: [{ type: "text", text: call.system }],
      messages: [
        {
          role: "user",
          content: [
            // Everything up to and including this block is cached — system
            // prompt and client reference material both.
            { type: "text", text: call.cachedPrefix, cache_control: { type: "ephemeral" } },
            { type: "text", text: call.volatile },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      throw new Error(
        `Claude refused the request (${response.stop_details?.category ?? "no category"})`,
      );
    }

    return response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
  }

  /**
   * Proves the API key is valid and authorised for `claude-opus-5`.
   *
   * Thinking is disabled and effort set to `low` so the probe stays cheap — on
   * Opus 5 thinking is on by default and would consume the token budget. No
   * `fallbacks` here on purpose: a fallback to another model would mask exactly
   * what this check exists to verify.
   */
  async checkConnectivity(): Promise<ConnectivityResult> {
    try {
      const response = await this.sdk.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 64,
        thinking: { type: "disabled" },
        output_config: { effort: "low" },
        messages: [
          { role: "user", content: "Reply with the single word: OK" },
        ],
      });

      if (response.stop_reason === "refusal") {
        return failed(
          SERVICE,
          new Error(`refused (${response.stop_details?.category ?? "no category"})`),
        );
      }

      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();

      return ok(
        SERVICE,
        `model ${response.model} replied ${JSON.stringify(text)} ` +
          `(${response.usage.input_tokens} in / ${response.usage.output_tokens} out)`,
      );
    } catch (error) {
      return failed(SERVICE, error);
    }
  }
}

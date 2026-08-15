import Anthropic from "@anthropic-ai/sdk";
import { claudeConfig, type ClaudeConfig } from "../../../config/env.js";
import { failed, ok, type ConnectivityResult } from "../connectivity.js";

/** The reasoning model Tamoa runs on. See docs/tech_stack.md §4. */
export const CLAUDE_MODEL = "claude-opus-5";

const SERVICE = "Claude";

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

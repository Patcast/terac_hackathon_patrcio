import { describe, expect, it } from "vitest";
import { LinqConversationChannel } from "../../../src/adapters/outbound/linq/LinqConversationChannel.js";
import type { LinqMessaging } from "../../../src/adapters/outbound/linq/LinqConversationChannel.js";
import type { LinqSentMessage } from "../../../src/adapters/outbound/linq/LinqClient.js";
import { PhoneNumber } from "../../../src/domain/model/Ids.js";

const OWNER = PhoneNumber.of("+15550101234");

class FakeLinq implements LinqMessaging {
  readonly sends: { to: string; text: string }[] = [];
  readonly typing: { to: string; on: boolean }[] = [];

  constructor(private readonly typingFails = false, private readonly id: string | null = "msg_1") {}

  async sendText(to: string, text: string): Promise<LinqSentMessage> {
    this.sends.push({ to, text });
    return { id: this.id };
  }

  async setTyping(to: string, on: boolean): Promise<void> {
    if (this.typingFails) throw new Error("404 Not Found");
    this.typing.push({ to, on });
  }
}

describe("LinqConversationChannel", () => {
  it("sends over the vendor client and returns the message ref", async () => {
    const linq = new FakeLinq();

    const ref = await new LinqConversationChannel(linq).sendText(OWNER, "hello");

    expect(linq.sends).toEqual([{ to: "+15550101234", text: "hello" }]);
    expect(ref.id).toBe("msg_1");
  });

  it("still returns a ref when the vendor gives no id — a send is still a send", async () => {
    const ref = await new LinqConversationChannel(new FakeLinq(false, null)).sendText(OWNER, "hi");

    expect(ref.id).toBe("unknown");
  });

  it("swallows and logs a failing typing indicator rather than losing the answer", async () => {
    const logged: string[] = [];
    const channel = new LinqConversationChannel(new FakeLinq(true), (message) => {
      logged.push(message);
    });

    await expect(channel.setTyping(OWNER, true)).resolves.toBeUndefined();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain("typing indicator (on) failed");
  });
});

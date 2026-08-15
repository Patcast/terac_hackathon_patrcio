import { describe, expect, it } from "vitest";

import { Month } from "../../src/domain/model/Month.js";
import { UnparseableMonthError } from "../../src/domain/errors/DomainError.js";

const utc = (year: number, month: number, day: number, hour = 0): Date =>
  new Date(Date.UTC(year, month - 1, day, hour));

describe("Month boundaries", () => {
  it("ends February 2024 on the 29th — a leap year", () => {
    const february = Month.of(2024, 2);
    expect(february.endsOnIso()).toBe("2024-02-29");
    expect(february.period().days()).toBe(29);
  });

  it("ends February 2026 on the 28th", () => {
    const february = Month.of(2026, 2);
    expect(february.endsOnIso()).toBe("2026-02-28");
    expect(february.period().days()).toBe(28);
  });

  it("ends a 30-day month on the 30th", () => {
    const april = Month.of(2026, 4);
    expect(april.endsOnIso()).toBe("2026-04-30");
    expect(april.period().days()).toBe(30);
  });

  it("puts the last instant of the month at 23:59:59.999 UTC", () => {
    expect(Month.of(2026, 7).endsOn().toISOString()).toBe("2026-07-31T23:59:59.999Z");
    expect(Month.of(2026, 7).startsOn().toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("rolls December over to January in both directions", () => {
    expect(Month.of(2025, 12).next().key()).toBe("2026-01");
    expect(Month.of(2026, 1).previous().key()).toBe("2025-12");
    expect(Month.of(2026, 1).sameMonthLastYear().key()).toBe("2025-01");
  });

  it("starts trailing(12) twelve months back, counting this one", () => {
    const window = Month.of(2026, 7).trailing(12);
    expect(window.fromIso()).toBe("2025-08-01");
    expect(window.toIso()).toBe("2026-07-31");

    const months = Month.of(2026, 7).trailingMonths(12);
    expect(months).toHaveLength(12);
    expect(months[0]?.key()).toBe("2025-08");
    expect(months[11]?.key()).toBe("2026-07");
  });
});

describe("ended vs settled", () => {
  const july = Month.of(2026, 7);
  const SETTLING_DAYS = 10;

  it("has not ended on the last day of the month", () => {
    expect(july.hasEnded(utc(2026, 7, 31, 12))).toBe(false);
    expect(july.isSettled(utc(2026, 7, 31, 12), SETTLING_DAYS)).toBe(false);
  });

  it("has ended but not settled inside the settling window", () => {
    const augustFirst = utc(2026, 8, 1);
    expect(july.hasEnded(augustFirst)).toBe(true);
    expect(july.isSettled(augustFirst, SETTLING_DAYS)).toBe(false);
    expect(july.daysUntilSettled(augustFirst, SETTLING_DAYS)).toBe(10);
  });

  it("is still unsettled on the last day of the window and settled after it", () => {
    expect(july.isSettled(utc(2026, 8, 10, 12), SETTLING_DAYS)).toBe(false);
    expect(july.isSettled(utc(2026, 8, 11), SETTLING_DAYS)).toBe(true);
    expect(july.daysUntilSettled(utc(2026, 8, 11), SETTLING_DAYS)).toBe(0);
  });

  it("defaults to the last month that has actually settled", () => {
    // 5 August: July has ended but is mid-window, so June is the honest answer.
    expect(Month.lastClosed(utc(2026, 8, 5), 10).key()).toBe("2026-06");
    expect(Month.lastClosed(utc(2026, 8, 15), 10).key()).toBe("2026-07");
    // A client whose books are clean on day 2 gets July on 3 August.
    expect(Month.lastClosed(utc(2026, 8, 3), 2).key()).toBe("2026-07");
  });
});

describe("Month.parse", () => {
  const now = utc(2026, 8, 15);

  it("reads the machine form", () => {
    expect(Month.parse("2026-07", now)?.key()).toBe("2026-07");
    expect(Month.parse("show me 2026-7 please", now)?.key()).toBe("2026-07");
  });

  it("reads a name with a year", () => {
    expect(Month.parse("July 2026", now)?.key()).toBe("2026-07");
    expect(Month.parse("how did jul 2025 go?", now)?.key()).toBe("2025-07");
    expect(Month.parse("Sept 2026", now)?.key()).toBe("2026-09");
  });

  it("resolves a bare name to the most recent one that has ended", () => {
    expect(Month.parse("July", now)?.key()).toBe("2026-07");
    // September 2026 has not ended in August 2026, so it means last September.
    expect(Month.parse("september", now)?.key()).toBe("2025-09");
    expect(Month.parse("july", utc(2026, 7, 15))?.key()).toBe("2025-07");
  });

  it("reads relative months against now", () => {
    expect(Month.parse("last month", now)?.key()).toBe("2026-07");
    expect(Month.parse("how are we doing this month?", now)?.key()).toBe("2026-08");
  });

  it("does not find a month inside an ordinary word", () => {
    // The bug this guards: a prefix glob made these March and December, and the
    // adapter parses the whole message — so the answer was about a month the
    // client never asked for.
    expect(Month.parse("how is marketing doing?", now)).toBeNull();
    expect(Month.parse("should I decide on the hire?", now)).toBeNull();
    expect(Month.parse("what about my margin", now)).toBeNull();
    expect(Month.parse("can we separate those", now)).toBeNull();
    expect(Month.parse("maybe next quarter", now)).toBeNull();
    expect(Month.parse("how much cash do I have?", now)).toBeNull();
  });

  it("throws only in the variant that asked for a month", () => {
    expect(() => Month.require("how much cash do I have?", now)).toThrow(UnparseableMonthError);
  });
});

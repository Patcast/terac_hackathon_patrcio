import type { Clock } from "../../application/ports/driven/Clock.js";

/** The one place a real `new Date()` is allowed outside a test. */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

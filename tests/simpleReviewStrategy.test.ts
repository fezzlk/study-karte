import { describe, expect, it } from "vitest";
import { SimpleReviewStrategy } from "../src/review/simpleReviewStrategy.js";

describe("SimpleReviewStrategy", () => {
  const strategy = new SimpleReviewStrategy();
  const at = new Date("2026-08-19T00:00:00.000Z");
  const DAY_MS = 24 * 60 * 60 * 1000;

  it("increases mastery by 1 on correct", () => {
    const result = strategy.schedule(2, "correct", at);
    expect(result.mastery).toBe(3);
  });

  it("decreases mastery by 2 on incorrect, clamped at 0", () => {
    expect(strategy.schedule(1, "incorrect", at).mastery).toBe(0);
    expect(strategy.schedule(0, "incorrect", at).mastery).toBe(0);
  });

  it("keeps mastery unchanged on partial", () => {
    expect(strategy.schedule(3, "partial", at).mastery).toBe(3);
  });

  it("clamps mastery at 5 on self_known", () => {
    expect(strategy.schedule(4, "self_known", at).mastery).toBe(5);
    expect(strategy.schedule(5, "self_known", at).mastery).toBe(5);
  });

  it("schedules the next review in the future", () => {
    const result = strategy.schedule(0, "correct", at);
    expect(new Date(result.nextReviewAt).getTime()).toBeGreaterThan(at.getTime());
    expect(new Date(result.nextReviewAt).getTime() - at.getTime()).toBe(1 * DAY_MS);
  });
});

export const reviewResults = ["correct", "incorrect", "partial", "self_known"] as const;

export type ReviewResult = (typeof reviewResults)[number];

export interface ReviewSchedule {
  mastery: number;
  nextReviewAt: string;
}

export interface ReviewStrategy {
  schedule(currentMastery: number, result: ReviewResult, reviewedAt: Date): ReviewSchedule;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const CORRECT_INTERVAL_DAYS = [1, 1, 3, 7, 14, 30];
const SELF_KNOWN_INTERVAL_DAYS = [3, 3, 7, 14, 30, 60];

function clampMastery(mastery: number): number {
  return Math.max(0, Math.min(5, mastery));
}

export class SimpleReviewStrategy implements ReviewStrategy {
  schedule(currentMastery: number, result: ReviewResult, reviewedAt: Date): ReviewSchedule {
    let mastery: number;
    let intervalDays: number;

    switch (result) {
      case "incorrect":
        mastery = clampMastery(currentMastery - 2);
        intervalDays = 1;
        break;
      case "partial":
        mastery = clampMastery(currentMastery);
        intervalDays = 1;
        break;
      case "correct":
        mastery = clampMastery(currentMastery + 1);
        intervalDays = CORRECT_INTERVAL_DAYS[mastery];
        break;
      case "self_known":
        mastery = clampMastery(currentMastery + 2);
        intervalDays = SELF_KNOWN_INTERVAL_DAYS[mastery];
        break;
    }

    return {
      mastery,
      nextReviewAt: new Date(reviewedAt.getTime() + intervalDays * DAY_MS).toISOString(),
    };
  }
}

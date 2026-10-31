export const DAILY_GIFT_LIMIT = 3;

export function startOfUtcDayMs(nowMs: number): number {
  const date = new Date(nowMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function hasReachedDailyLimit(sentTodayCount: number): boolean {
  return sentTodayCount >= DAILY_GIFT_LIMIT;
}

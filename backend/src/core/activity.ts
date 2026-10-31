export const SMOKE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
export const OVERGROWN_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
export const ONLINE_WINDOW_MS = 2 * 60 * 1000;

export function hasSmoke(lastSeenAtMs: number, nowMs: number): boolean {
  return nowMs - lastSeenAtMs < SMOKE_WINDOW_MS;
}

export function isOvergrown(lastSeenAtMs: number, nowMs: number): boolean {
  return nowMs - lastSeenAtMs > OVERGROWN_WINDOW_MS;
}

export function isOnline(lastSeenAtMs: number, nowMs: number): boolean {
  return nowMs - lastSeenAtMs < ONLINE_WINDOW_MS;
}

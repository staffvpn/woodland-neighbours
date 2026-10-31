export const RESPAWN_HOURS = 24;

export function isNodeAvailable(available: boolean, respawnsAtMs: number | null, nowMs: number): boolean {
  if (available) return true;
  if (respawnsAtMs === null) return false;
  return nowMs >= respawnsAtMs;
}

export function nextRespawnAt(nowMs: number): number {
  return nowMs + RESPAWN_HOURS * 60 * 60 * 1000;
}

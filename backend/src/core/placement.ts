export interface Point {
  x: number;
  y: number;
}

export const RIVER_HALF_WIDTH = 3;
export const MIN_HOUSE_DISTANCE = 4;

const BASE_RADIUS = 8;
const RADIUS_GROWTH_K = 2.2;
const RADIUS_SEARCH_MARGIN = 1.3;
export const RING_ANGLE_STEP_DEG = 10;
export const RING_RADIAL_STEP = 1.5;
export const MAX_SEARCH_RINGS = 400;

export function isInRiver(p: Point): boolean {
  return p.x > -RIVER_HALF_WIDTH && p.x < RIVER_HALF_WIDTH;
}

export function settlementRadius(houseCount: number): number {
  return BASE_RADIUS + RADIUS_GROWTH_K * Math.sqrt(houseCount);
}

function isFarEnoughFromAll(p: Point, existingHouses: Point[]): boolean {
  return existingHouses.every((house) => Math.hypot(p.x - house.x, p.y - house.y) >= MIN_HOUSE_DISTANCE);
}

export function findHousePlacement(existingHouses: Point[]): Point {
  const maxRadius = settlementRadius(existingHouses.length) * RADIUS_SEARCH_MARGIN;

  for (let ring = 1; ring <= MAX_SEARCH_RINGS; ring++) {
    const radius = ring * RING_RADIAL_STEP;
    if (radius > maxRadius) break;

    for (let angleDeg = 0; angleDeg < 360; angleDeg += RING_ANGLE_STEP_DEG) {
      const angleRad = (angleDeg * Math.PI) / 180;
      const candidate: Point = {
        x: Math.cos(angleRad) * radius,
        y: Math.sin(angleRad) * radius,
      };

      if (isInRiver(candidate)) continue;
      if (!isFarEnoughFromAll(candidate, existingHouses)) continue;

      return candidate;
    }
  }

  throw new Error("no valid placement found within the current settlement radius");
}

export const FOUNDER_POSITION: Point = { x: 6, y: -3 };

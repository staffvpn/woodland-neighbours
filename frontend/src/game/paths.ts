export interface Point {
  x: number;
  y: number;
}

export function computePathSegments(houses: Point[], campfire: Point): [Point, Point][] {
  const priorNodes: Point[] = [campfire];
  const segments: [Point, Point][] = [];

  for (const house of houses) {
    let nearest = priorNodes[0];
    let nearestDist = Math.hypot(house.x - nearest.x, house.y - nearest.y);

    for (const node of priorNodes) {
      const dist = Math.hypot(house.x - node.x, house.y - node.y);
      if (dist < nearestDist) {
        nearest = node;
        nearestDist = dist;
      }
    }

    segments.push([nearest, house]);
    priorNodes.push(house);
  }

  return segments;
}

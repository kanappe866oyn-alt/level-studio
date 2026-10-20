import { buildingReservations, terrainFloorReservations } from './proceduralBuildings.js';

const overlaps = (a, b) => a.minX < b.maxX - 0.01 && a.maxX > b.minX + 0.01 && a.minZ < b.maxZ - 0.01 && a.maxZ > b.minZ + 0.01;

// Make recessed forecourt pockets within the reserved plot, without scaling
// native houses or changing the street graph. Existing recipes remain opt-in.
export function withRecessedFrontages(plan, seed) {
  if (!plan.buildings?.length) return plan;
  const floors = terrainFloorReservations(plan), buildings = plan.buildings.map(p => ({ ...p }));
  let state = (seed ^ 0x27d4eb2d) >>> 0 || 1;
  const next = n => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) % n; };
  for (let i = 0; i < buildings.length; i++) {
    const plot = buildings[i], count = plot.variants?.length ?? plot.count ?? 1;
    if (count < 2) continue;
    const inset = next(count), depth = [1, 1.5, 2][next(3)];
    const others = buildings.filter((_, j) => i !== j).flatMap(p => buildingReservations(plan, p));
    for (const amount of [depth, 0.75]) {
      const setbacks = Array.from({ length: count }, (_, j) => j === inset ? amount : 0);
      const candidate = { ...plot, setbacks };
      if (buildingReservations(plan, candidate).some(b => [...floors, ...others].some(other => overlaps(b, other)))) continue;
      buildings[i] = candidate; break;
    }
  }
  return { ...plan, buildings };
}

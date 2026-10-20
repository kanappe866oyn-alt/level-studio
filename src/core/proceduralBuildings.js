import { buildingPlotLayout } from './buildingKit.js';
import { getBounds } from './spatialGeometry.js';

const overlaps = (a, b) => a.minX < b.maxX - 0.01 && a.maxX > b.minX + 0.01 && a.minZ < b.maxZ - 0.01 && a.maxZ > b.minZ + 0.01;
const bounds = (x, z, width, depth, yaw = 0) => getBounds({ pos: [x, 0, z], size: [width, 0.3, depth], rot: [0, yaw, 0] });

export function buildingReservations(plan, plot) {
  const a = plan.areas.find(a => a.id === plot.from), area = { ...a, x: a.gx * 16, z: a.gz * 16, y: a.level * 4 };
  const l = buildingPlotLayout(plot, area);
  return [bounds(l.x, l.z, ...l.lot, l.yaw), bounds(area.x + l.nx * (l.radius + l.approachLength / 2), area.z + l.nz * (l.radius + l.approachLength / 2), plot.forecourtWidth ?? 5, l.approachLength, l.yaw)];
}

export function terrainFloorReservations(plan) {
  const floors = plan.areas.map(a => bounds(a.gx * 16, a.gz * 16, a.width, a.depth));
  for (const c of plan.connections) {
    const a = plan.areas.find(a => a.id === c.from), b = plan.areas.find(a => a.id === c.to);
    const axisZ = a.gx === b.gx, extent = axisZ ? 'depth' : 'width';
    const length = Math.abs((axisZ ? a.gz - b.gz : a.gx - b.gx) * 16) - (a[extent] + b[extent]) / 2;
    const direction = Math.sign((axisZ ? b.gz - a.gz : b.gx - a.gx));
    const start = (axisZ ? a.gz : a.gx) * 16 + direction * a[extent] / 2;
    const end = (axisZ ? b.gz : b.gx) * 16 - direction * b[extent] / 2;
    const width = c.width + 2 * ((c.flare || 0) + Math.abs(c.curve || 0));
    floors.push(axisZ ? bounds(a.gx * 16, (start + end) / 2, width, length) : bounds((start + end) / 2, a.gz * 16, length, width));
  }
  return floors;
}

export function varyBuildingRows(plan, seed) {
  if (!plan.buildings?.length) return plan;
  const floors = terrainFloorReservations(plan);
  let state = (seed ^ 0x85ebca6b) >>> 0 || 1;
  const next = n => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) % n; };
  const buildings = plan.buildings.map(p => ({ ...p, ...(p.variants ? { variants: [...p.variants] } : {}) }));
  const count = p => p.variants?.length ?? p.count ?? 1;
  const rows = [[2], [1], [3], [1, 2], [2, 1], [3, 2], [2, 3], [2, 1, 2], [2, 3, 2]];
  for (let i = 0; i < buildings.length; i++) {
    const original = buildings[i], minimum = count(original);
    const candidates = rows.filter(row => row.length >= minimum).map(row => ({ row, order: next(0x1000000) })).sort((a, b) => a.order - b.order);
    const others = buildings.filter((_, j) => j !== i).flatMap(p => buildingReservations(plan, p));
    for (const { row } of candidates) {
      if (buildings.reduce((n, p) => n + count(p), 0) - count(original) + row.length > 10) continue;
      const candidate = { ...original, variant: row[0], count: row.length, variants: [...row] };
      const reserved = buildingReservations(plan, candidate);
      if (reserved.some(b => [...floors, ...others].some(other => overlaps(b, other)))) continue;
      buildings[i] = candidate; break;
    }
  }
  return { ...plan, buildings };
}

import { SPATIAL_GRID, validateSpatialPlan } from './spatialPlan.js';

// Expand shared coordinate lines, so every aligned portal and graph edge stays
// aligned. Never shrink a plaza, lower a terrace or replace a requested ramp.
// This is a candidate repair only: assembly, walking and sight checks still run.
export function repairSpatialPlanSpacing(input) {
  const plan = validateSpatialPlan(input);
  const byId = new Map(plan.areas.map(a => [a.id, a]));
  const changes = [];
  const roomConstraints = { gx: [], gz: [] };
  for (let i = 0; i < plan.areas.length; i++) for (let j = i + 1; j < plan.areas.length; j++) {
    const a = plan.areas[i], b = plan.areas[j];
    // Match the assembler's floor/wall envelope. Keep legitimate upper/lower
    // overlaps: expanding those would destroy the intended stacked routes.
    if (Math.abs(a.level - b.level) * 4 >= 3.4) continue;
    const choices = [['gx', 'width'], ['gz', 'depth']].map(([axis, size]) => ({
      axis, gap: Math.abs(a[axis] - b[axis]) * SPATIAL_GRID,
      distance: Math.ceil((a[size] + b[size]) / 2 + 0.5),
    }));
    if (choices.some(c => c.gap >= c.distance)) continue;
    const choice = choices.filter(c => c.gap > 0).sort((a, b) => (a.distance - a.gap) - (b.distance - b.gap))[0];
    if (!choice) return null;
    roomConstraints[choice.axis].push({ a: a.id, b: b.id, distance: choice.distance });
  }
  for (const [axis, dimension] of [['gx', 'width'], ['gz', 'depth']]) {
    const lines = [...new Set(plan.areas.map(a => a[axis] * SPATIAL_GRID))].sort((a, b) => a - b);
    const constraints = [];
    for (const c of roomConstraints[axis]) {
      const a = byId.get(c.a), b = byId.get(c.b);
      constraints.push({ from: lines.indexOf(Math.min(a[axis], b[axis]) * SPATIAL_GRID),
        to: lines.indexOf(Math.max(a[axis], b[axis]) * SPATIAL_GRID), distance: c.distance });
    }
    for (const c of plan.connections) {
      const a = byId.get(c.from), b = byId.get(c.to);
      if (a[axis] === b[axis]) continue;
      const rise = Math.abs(a.level - b.level) * 4;
      const run = Math.max(1, rise * (c.traversal === 'ramp' ? 3 : 1.2),
        c.curve ? Math.max(rise && c.traversal !== 'ramp' ? 6 : 8, Math.abs(c.curve) * 3) : 0);
      const low = Math.min(a[axis], b[axis]) * SPATIAL_GRID;
      const high = Math.max(a[axis], b[axis]) * SPATIAL_GRID;
      constraints.push({ from: lines.indexOf(low), to: lines.indexOf(high), distance: Math.ceil((a[dimension] + b[dimension]) / 2 + run) });
    }
    const positions = [...lines];
    // The coordinate order is a DAG; a forward pass solves all lower bounds.
    for (let i = 1; i < lines.length; i++) {
      positions[i] = Math.max(positions[i], positions[i - 1] + lines[i] - lines[i - 1]);
      for (const c of constraints.filter(c => c.to === i)) positions[i] = Math.max(positions[i], positions[c.from] + c.distance);
    }
    if (positions.every((v, i) => v === lines[i])) continue;
    if (positions.at(-1) - positions[0] > 6 * SPATIAL_GRID) return null;
    // Integer translation minimizes total squared displacement within bounds.
    const preferred = Math.round(positions.reduce((sum, v, i) => sum + lines[i] - v, 0) / lines.length);
    const shift = Math.max(-3 * SPATIAL_GRID - positions[0], Math.min(3 * SPATIAL_GRID - positions.at(-1), preferred));
    for (const a of plan.areas) {
      const before = a[axis] * SPATIAL_GRID, after = positions[lines.indexOf(before)] + shift;
      if (before !== after) changes.push({ area: a.id, axis: axis === 'gx' ? 'x' : 'z', before, after });
      a[axis] = after / SPATIAL_GRID;
    }
  }
  return changes.length ? { plan, changes } : null;
}

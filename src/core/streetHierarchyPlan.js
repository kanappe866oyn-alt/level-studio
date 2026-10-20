import { spatialCornerInset } from './spatialPlan.js';
import { terrainCornerCut } from './terrainContours.js';

// Give the shortest designed arrival-to-goal route a broader cross section.
// Keep the graph, elevations and native building choices; reserve the actual
// wider forecourt in the same plan used by both assembly and validation.
export function withStreetHierarchy(plan) {
  const entry = plan.areas.find(a => a.kind === 'entry'), goal = plan.areas.find(a => a.kind === 'goal');
  const costs = new Map([[entry.id, 0]]), previous = new Map(), pending = new Set(plan.areas.map(a => a.id));
  while (pending.size) {
    const id = [...pending].sort((a, b) => (costs.get(a) ?? Infinity) - (costs.get(b) ?? Infinity))[0];
    pending.delete(id);
    if (!costs.has(id) || id === goal.id) break;
    for (const c of plan.connections) {
      const next = c.from === id ? c.to : c.to === id ? c.from : null;
      if (!pending.has(next)) continue;
      const a = plan.areas.find(a => a.id === id), b = plan.areas.find(a => a.id === next);
      const cost = costs.get(id) + Math.hypot(a.gx - b.gx, a.gz - b.gz) * 16 + Math.abs(a.level - b.level) * 8;
      if (cost < (costs.get(next) ?? Infinity)) { costs.set(next, cost); previous.set(next, { id, c }); }
    }
  }
  const main = new Set();
  for (let id = goal.id; previous.has(id); id = previous.get(id).id) main.add(previous.get(id).c);
  const connections = plan.connections.map(c => {
    if (!main.has(c)) return c;
    const a = plan.areas.find(a => a.id === c.from), b = plan.areas.find(a => a.id === c.to);
    const extent = a.gx === b.gx ? 'width' : 'depth';
    const opening = Math.min(...[a, b].map(a => a[extent] - 2 * (a.footprint === 'inset-corners' ? spatialCornerInset(a) : terrainCornerCut(a)) - 0.5));
    const width = Math.min(5, opening), flare = Math.max(0, Math.min(c.flare ?? 0.5, (opening - width) / 2));
    return { ...c, width, flare };
  });
  const buildings = plan.buildings?.map(p => (p.variants?.length ?? p.count ?? 1) > 1 ? { ...p, approachWidth: 5, forecourtWidth: 8 } : p);
  return { ...plan, connections, ...(buildings ? { buildings } : {}) };
}

import { inspectSpatialSightlines } from './spatialSightlines.js';
import { spatialConnectionPoints } from './terrainCurve.js';

// Distances follow the original connection centres. Stairs use their slope
// length between openings, rather than spreading their rise over whole rooms.
export function spatialConnectionDistance(a, b, connection) {
  if (connection?.curve || connection?.flare) {
    const points = spatialConnectionPoints(a, b, connection);
    return points.slice(1).reduce((sum, point, i) => sum + Math.hypot(point.x - points[i].x, point.y - points[i].y, point.z - points[i].z), 0);
  }
  const horizontal = Math.hypot(b.x - a.x, b.z - a.z);
  const extent = a.x === b.x ? 'depth' : 'width';
  const gap = Math.max(0, horizontal - (a[extent] + b[extent]) / 2);
  return horizontal - gap + Math.hypot(gap, b.y - a.y);
}

export function measureSpatialStage(objects, areas, connections, supports) {
  const byId = new Map(areas.map(a => [a.id, a]));
  const supported = new Set(supports.filter(s => s.passed).map(s => s.id));
  const entry = areas.find(a => a.kind === 'entry'), goal = areas.find(a => a.kind === 'goal');
  const distance = new Map(areas.map(a => [a.id, Infinity])), parent = new Map(), visited = new Set();
  if (entry && supported.has(entry.id)) distance.set(entry.id, 0);
  for (let i = 0; i < areas.length; i++) {
    const next = areas.filter(a => !visited.has(a.id)).sort((a, b) => distance.get(a.id) - distance.get(b.id))[0];
    if (!next || !Number.isFinite(distance.get(next.id))) break;
    visited.add(next.id);
    for (const c of connections.filter(c => c.passed && supported.has(c.from) && supported.has(c.to) && (c.from === next.id || c.to === next.id))) {
      const id = c.from === next.id ? c.to : c.from;
      const candidate = distance.get(next.id) + spatialConnectionDistance(next, byId.get(id), c);
      if (candidate < distance.get(id)) { distance.set(id, candidate); parent.set(id, next.id); }
    }
  }
  const goalDistance = goal && Number.isFinite(distance.get(goal.id)) ? distance.get(goal.id) : null;
  const path = [];
  if (goalDistance !== null) for (let id = goal.id; id; id = parent.get(id)) path.unshift(id);
  const pairs = [];
  const candidates = areas.filter(a => supported.has(a.id));
  for (let i = 0; i < candidates.length; i++) for (let j = i + 1; j < candidates.length; j++) pairs.push({ from: candidates[i].id, to: candidates[j].id, relation: 'visible' });
  const visibility = inspectSpatialSightlines(objects, areas, pairs);
  const highCoverage = areas.filter(a => a.kind === 'high' && a.level > 0).map(a => {
    const lines = visibility.filter(s => s.from === a.id || s.to === a.id);
    const visible = lines.filter(s => s.passed);
    return { id: a.id, name: a.name, checked: lines.length, visible: visible.length, available: supported.has(a.id),
      targets: visible.map(s => byId.get(s.from === a.id ? s.to : s.from).name) };
  }).sort((a, b) => b.visible - a.visible);
  const longestSightlines = visibility.filter(s => s.visibleSamples > 0).sort((a, b) => b.maxVisibleDistance - a.maxVisibleDistance).slice(0, 3).map(s => ({ ...s,
    label: `${byId.get(s.from).name} → ${byId.get(s.to).name}`, kind: 'sight', id: `measurement:${s.from}:${s.to}` }));
  return { goalDistance, path: path.map(id => ({ id, name: byId.get(id).name })),
    areaDistances: areas.map(a => ({ id: a.id, name: a.name, distance: Number.isFinite(distance.get(a.id)) ? distance.get(a.id) : null })),
    highCoverage, longestSightlines, checkedPairs: visibility.length };
}

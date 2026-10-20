import { independentRoutePaths } from './spatialPlan.js';
import { spatialConnectionDistance } from './spatialMeasurements.js';
import { spatialConnectionPoints } from './terrainCurve.js';

const COLORS = ['#4edfff', '#ff8cdc', '#ffd45a', '#94ed70', '#c4a0ff', '#ff9f73'];

// These are representative edge-disjoint routes, not all possible paths.
// Sharing an intermediate area is useful playtest context, not a failure.
export function compareSpatialRoutes(routes) {
  const measured = routes.filter(r => Number.isFinite(r.distance) && r.distance >= 0);
  if (measured.length < 2) return null;
  const ordered = [...measured].sort((a, b) => a.distance - b.distance);
  const shortest = ordered[0], longest = ordered.at(-1), visits = new Map();
  const climbing = measured.filter(r => Number.isFinite(r.ascent) && r.ascent >= 0).sort((a, b) => a.ascent - b.ascent);
  const climb = r => ({ id: r.id, label: r.label, ascent: r.ascent });
  for (const route of measured) {
    for (const a of new Map(route.areas.slice(1, -1).map(a => [a.id, a])).values()) {
      const current = visits.get(a.id) || { ...a, routes: 0 };
      current.routes++;
      visits.set(a.id, current);
    }
  }
  return { count: measured.length, shortest: { id: shortest.id, label: shortest.label, distance: shortest.distance },
    longest: { id: longest.id, label: longest.label, distance: longest.distance },
    difference: longest.distance - shortest.distance, ratio: shortest.distance > 0 ? longest.distance / shortest.distance : null,
    climbing: climbing.length > 1 ? { least: climb(climbing[0]), most: climb(climbing.at(-1)), difference: climbing.at(-1).ascent - climbing[0].ascent } : null,
    sharedAreas: [...visits.values()].filter(a => a.routes > 1) };
}

export function spatialRouteViews(areas, connections) {
  const byId = new Map(areas.map(a => [a.id, a]));
  return independentRoutePaths(areas, connections.filter(c => c.passed)).map((ids, index) => {
    const points = [], links = [];
    let distance = 0, ascent = 0, descent = 0;
    for (let i = 0; i < ids.length; i++) {
      const a = byId.get(ids[i]);
      points.push([a.x, a.y + 0.25, a.z]);
      const b = byId.get(ids[i + 1]);
      if (!b) continue;
      ascent += Math.max(0, b.y - a.y);
      descent += Math.max(0, a.y - b.y);
      const connection = connections.find(c => c.from === a.id && c.to === b.id || c.from === b.id && c.to === a.id);
      distance += spatialConnectionDistance(a, b, connection);
      links.push([a.id, b.id]);
      if (connection?.curve || connection?.flare) points.push(...spatialConnectionPoints(a, b, connection).slice(1, -1).map(p => [p.x, p.y + 0.25, p.z]));
      else if (a.y !== b.y) {
        const alongX = a.x !== b.x, axis = alongX ? 'x' : 'z', extent = alongX ? 'width' : 'depth';
        const direction = Math.sign(b[axis] - a[axis]);
        points.push(alongX ? [a.x + direction * a.width / 2, a.y + 0.25, a.z] : [a.x, a.y + 0.25, a.z + direction * a.depth / 2]);
        points.push(alongX ? [b.x - direction * b[extent] / 2, b.y + 0.25, b.z] : [b.x, b.y + 0.25, b.z - direction * b[extent] / 2]);
      }
    }
    return { id: `route_${index + 1}`, label: `経路${index + 1}`, color: COLORS[index % COLORS.length], distance, ascent, descent,
      highest: Math.max(...ids.map(id => byId.get(id).y)), points, links, areas: ids.map(id => ({ id, name: byId.get(id).name })) };
  });
}

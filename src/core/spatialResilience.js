import { independentRouteCount } from './spatialPlan.js';

function reachable(areas, connections) {
  const start = areas.find(a => a.kind === 'entry')?.id;
  const seen = new Set(start ? [start] : []), queue = [...seen];
  for (let i = 0; i < queue.length; i++) for (const c of connections) {
    const next = c.from === queue[i] ? c.to : c.to === queue[i] ? c.from : null;
    if (next && !seen.has(next)) { seen.add(next); queue.push(next); }
  }
  return seen;
}

// Simulate a missing edge without moving, deleting or blocking any scene object.
export function inspectSpatialResilience(areas, connections) {
  const verified = connections.filter(c => c.passed), baseline = reachable(areas, verified);
  const goal = areas.find(a => a.kind === 'goal')?.id;
  const name = id => areas.find(a => a.id === id)?.name || id;
  const scenarios = connections.flatMap((c, index) => {
    if (!c.passed) return [];
    const remaining = verified.filter(link => link !== c), seen = reachable(areas, remaining);
    const isolated = areas.filter(a => baseline.has(a.id) && !seen.has(a.id)).map(a => ({ id: a.id, name: a.name }));
    return [{ id: `closure:${index}`, kind: 'connection', objectId: `sp_link_${index}`, from: c.from, to: c.to,
      label: `${name(c.from)} → ${name(c.to)}`, goalReachable: !!goal && seen.has(goal),
      goalLost: !!goal && baseline.has(goal) && !seen.has(goal), routesRemaining: independentRouteCount(areas, remaining), isolated }];
  }).sort((a, b) => Number(b.goalLost) - Number(a.goalLost) || b.isolated.length - a.isolated.length || a.routesRemaining - b.routesRemaining);
  return { testedConnections: scenarios.length, baselineGoalReachable: !!goal && baseline.has(goal),
    baselineUnreachable: areas.filter(a => !baseline.has(a.id)).map(a => ({ id: a.id, name: a.name })),
    goalCutCount: scenarios.filter(s => s.goalLost).length, isolationCount: scenarios.filter(s => s.isolated.length > 0).length, scenarios };
}

// Make the four-metre central ascent a sequence of two stairs and a usable
// eight-metre landing. Move the complete destination row together so its
// horizontal links stay aligned, including after rotation and mirroring.
export function withStairTerrace(plan) {
  const centre = plan.areas.find(a => a.id === 'centre'), goal = plan.areas.find(a => a.id === 'goal');
  const old = plan.connections.find(c => c.from === centre?.id && c.to === goal?.id);
  if (!old || goal.level - centre.level !== 1) return plan;
  const axis = centre.gx === goal.gx ? 'gz' : 'gx', direction = Math.sign(goal[axis] - centre[axis]);
  const row = goal[axis], shift = direction * 8 / 16;
  const areas = plan.areas.map(a => a[axis] === row ? { ...a, [axis]: a[axis] + shift } : a);
  const destination = areas.find(a => a.id === goal.id);
  const landing = { id: 'central_landing', name: '中央階段の中段広場', kind: 'passage',
    gx: (centre.gx + destination.gx) / 2, gz: (centre.gz + destination.gz) / 2,
    level: centre.level + 0.5, width: 8, depth: 8, enclosure: 'open' };
  const stair = (from, to) => ({ from, to, width: old.width, enclosure: 'open', traversal: 'stairs', flare: Math.min(old.flare || 0.25, 0.25) });
  return { ...plan, intent: `${plan.intent} 中央の上りは2mの中段広場で分け、0・2・4mの三段を歩いて登る。`,
    areas: [...areas, landing], connections: plan.connections.flatMap(c => c === old ? [stair(centre.id, landing.id), stair(landing.id, goal.id)] : [c]) };
}

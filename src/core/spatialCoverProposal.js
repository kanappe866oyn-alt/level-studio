import { SPATIAL_GRID } from './spatialPlan.js';
import { createSpatialWorld, worldXZ } from './spatialGeometry.js';
import { inspectSpatialSightlines } from './spatialSightlines.js';
import { recheckSpatialStage } from './spatialRecheck.js';
import { PLAYER_EYE_HEIGHT } from './worldScale.js';

export async function proposeSpatialCover(objects, design, target, { signal, onProgress, yieldTask = () => new Promise(resolve => setTimeout(resolve, 0)) } = {}) {
  signal?.throwIfAborted();
  const baseline = recheckSpatialStage(objects, design);
  if (!baseline.passed) throw new Error('先に現在の経路・指定条件の問題を直してください。');
  const areas = design.plan.areas.map(a => ({ ...a, x: a.gx * SPATIAL_GRID, z: a.gz * SPATIAL_GRID, y: a.level * 4 }));
  const condition = { from: target.from, to: target.to, relation: 'visible' };
  const before = inspectSpatialSightlines(objects, areas, [condition])[0];
  if (!before.longestSegment) return { candidate: null, before, attempted: 0 };
  const world = createSpatialWorld(objects), ids = new Set(objects.map(o => o.id));
  let suffix = 1;
  while (ids.has(`sp_cover_${suffix}`)) suffix++;
  const { from, to } = before.longestSegment;
  const yaw = Math.atan2(to[0] - from[0], to[2] - from[2]);
  let best = null, attempted = 0;
  for (const fraction of [0.03, 0.06, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9, 0.94, 0.97]) for (const width of [2, 3]) {
    signal?.throwIfAborted();
    await yieldTask();
    signal?.throwIfAborted();
    const point = from.map((v, i) => v + (to[i] - v) * fraction);
    const floor = world.floor(point[0], point[2], point[1] - PLAYER_EYE_HEIGHT);
    const height = Math.max(2, point[1] - floor + 0.3);
    if (!Number.isFinite(floor) || floor < -0.05 || height > 3.2 || world.dangerous(point[0], point[2], floor)) continue;
    const object = { id: `sp_cover_${suffix}`, name: '射線調整の遮蔽物', role: 'cover', type: 'box', pos: [point[0], floor + height / 2, point[2]], size: [width, height, 0.5], rot: [0, yaw, 0], color: '#c7b791', variant: 1, material: 0 };
    const supported = [-0.5, 0, 0.5].every(dx => [-0.5, 0, 0.5].every(dz => {
      const [x, z] = worldXZ(object, dx * width, dz * 0.5);
      return Math.abs(world.floor(x, z, floor) - floor) < 0.05 && !world.dangerous(x, z, floor);
    }));
    if (!supported) continue;
    attempted++; onProgress?.(attempted);
    const candidateObjects = [...objects, object];
    const after = inspectSpatialSightlines(candidateObjects, areas, [condition])[0];
    if (before.maxVisibleDistance - after.maxVisibleDistance < 0.5) continue;
    const report = recheckSpatialStage(candidateObjects, design);
    if (!report.passed || report.connections.some((c, i) => c.passed !== baseline.connections[i].passed)) continue;
    if (!best || after.maxVisibleDistance < best.after.maxVisibleDistance) best = { object, after, report };
  }
  signal?.throwIfAborted();
  return { candidate: best?.object || null, before, after: best?.after || null, report: best?.report || null, attempted };
}

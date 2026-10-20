import { createSpatialWorld, WALKING } from './spatialGeometry.js';
import { advanceWalker } from './walkingPhysics.js';
import { SPATIAL_GRID } from './spatialPlan.js';
import { connectionWidth, curveOffset } from './terrainCurve.js';
import { getStairLayout } from './assemblySizing.js';

// Three lanes across each mouth, in both directions, using the play controller.
// Keep a body radius plus 20 cm away from the boundary and follow the flare.
export function inspectTerrainPortalWalking(objects, plan) {
  const enabled = new Set(objects.filter(o => o.terrainProfile?.portalWidth !== undefined).map(o => o.id));
  if (!enabled.size) return [];
  const world = createSpatialWorld(objects), results = [];
  const walk = points => {
    const first = points[0], last = points.at(-1);
    let state = { ...first, vy: 0 };
    const floor = world.floor(first.x, first.z, first.y);
    if (!Number.isFinite(floor) || Math.abs(floor - first.y) > 0.05 || world.blocked(first.x, first.z, floor)) return false;
    for (const target of points.slice(1)) {
      const dx = target.x - state.x, dz = target.z - state.z;
      state = advanceWalker(world, state, dx, dz, 0.01);
      if (Math.hypot(state.x - target.x, state.z - target.z) > 0.03 || world.dangerous(state.x, state.z, state.y)) return false;
    }
    for (let i = 0; i < 40; i++) state = advanceWalker(world, state, 0, 0, 0.01);
    return Math.abs(state.y - last.y) < 0.05 && !world.dangerous(state.x, state.z, state.y);
  };
  for (const c of plan.connections) {
    const a = plan.areas.find(a => a.id === c.from), b = plan.areas.find(a => a.id === c.to);
    const axisZ = a.gx === b.gx, extent = axisZ ? 'depth' : 'width';
    const ax = a.gx * SPATIAL_GRID, az = a.gz * SPATIAL_GRID, bx = b.gx * SPATIAL_GRID, bz = b.gz * SPATIAL_GRID;
    const sign = Math.sign(axisZ ? bz - az : bx - ax), yaw = Math.atan2(bx - ax, bz - az);
    const run = Math.abs(axisZ ? bz - az : bx - ax) - (a[extent] + b[extent]) / 2;
    const rise = Math.abs(a.level - b.level) * 4;
    const count = rise && c.traversal !== 'ramp' ? getStairLayout([c.width, rise, run]).count : 0;
    for (const [room, end] of [[a, 0], [b, 1]]) {
      if (!enabled.has(`sp_area_${room.id}`)) continue;
      const portal = (axisZ ? room.gz : room.gx) * SPATIAL_GRID + (end ? -sign : sign) * room[extent] / 2;
      const reach = Math.min(0.8, run / 3);
      for (const lane of [-1, 0, 1]) {
        const points = Array.from({ length: 33 }, (_, i) => {
          const d = (i / 16 - 1) * reach, t = Math.max(0, Math.min(1, end ? 1 - d / run : d / run));
          const offset = curveOffset(c.curve || 0, t) + lane * Math.max(0, connectionWidth(c.width, c.flare, t) / 2 - WALKING.radius - 0.2);
          const along = portal + (end ? -sign : sign) * d;
          const fraction = !count ? t : b.level > a.level ? Math.ceil(t * count) / count : (count - Math.floor(t * count)) / count;
          return { x: (axisZ ? room.gx * SPATIAL_GRID : along) + Math.cos(yaw) * offset,
            z: (axisZ ? along : room.gz * SPATIAL_GRID) - Math.sin(yaw) * offset,
            y: d <= 0 ? room.level * 4 : count ? Math.min(a.level, b.level) * 4 + rise * fraction : (a.level + (b.level - a.level) * t) * 4 };
        });
        results.push({ from: c.from, to: c.to, area: room.id, lane, forward: walk(points), backward: walk([...points].reverse()) });
      }
    }
  }
  return results;
}

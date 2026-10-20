import { WALKING } from './spatialGeometry.js';

// Test-play state belongs to one run, never to the saved stage.
export function createPlayProgress(objects, world, startFeet) {
  const targets = objects.filter(o => o.role === 'checkpoint' || o.role === 'goal').flatMap(o => {
    const [x, y, z] = o.pos;
    const floor = world.floor(x, z, y - o.size[1] / 2);
    if (!Number.isFinite(floor) || Math.abs(floor - (y - o.size[1] / 2)) > 0.12 || world.dangerous(x, z, floor)) return [];
    return [{ id: o.id, role: o.role, name: o.name || (o.role === 'goal' ? 'ゴール' : '休憩地点'), feet: [x, floor, z] }];
  });
  const visited = new Set();
  let nearby = new Set();
  let active = null, goalReached = false, respawn = [...startFeet];
  let message = '休憩地点に到達すると、そこから再開できます';
  const snapshot = () => ({ checkpointCount: visited.size, checkpointTotal: targets.filter(t => t.role === 'checkpoint').length,
    hasGoal: targets.some(t => t.role === 'goal'), goalReached, activeName: active?.name || '開始地点', message });
  const reachable = (feet, target) => {
    const distance = Math.hypot(feet[0] - target[0], feet[2] - target[2]);
    if (distance > 0.9 || Math.abs(feet[1] - target[1]) > 0.12) return false;
    let y = feet[1];
    const steps = Math.max(1, Math.ceil(distance / 0.08));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, x = feet[0] + (target[0] - feet[0]) * t, z = feet[2] + (target[2] - feet[2]) * t;
      const floor = world.floor(x, z, y);
      if (!Number.isFinite(floor) || Math.abs(floor - y) > WALKING.stepHeight || world.blocked(x, z, floor) || world.dangerous(x, z, floor)) return false;
      y = floor;
    }
    return Math.abs(y - target[1]) <= 0.12;
  };
  return {
    snapshot,
    arrive(feet) {
      let changed = false;
      const nextNearby = new Set();
      for (const target of targets) {
        if (!reachable(feet, target.feet)) continue;
        nextNearby.add(target.id);
        if (nearby.has(target.id) || (target.role === 'goal' ? goalReached : active?.id === target.id)) continue;
        if (target.role === 'checkpoint') {
          visited.add(target.id); active = target; respawn = [...target.feet];
          message = `${target.name}に到達。ここから再開できます`;
        } else {
          goalReached = true; message = `${target.name}に到着しました`;
        }
        changed = true;
      }
      nearby = nextNearby;
      return changed ? snapshot() : null;
    },
    recover() {
      nearby = new Set(active ? [active.id] : []);
      message = `${active?.name || '開始地点'}から再開しました`;
      return { feet: [...respawn], progress: snapshot() };
    },
  };
}

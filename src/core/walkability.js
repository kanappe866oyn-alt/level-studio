import { createSpatialWorld, getBounds, isWalkable, WALKING, isUpright } from './spatialGeometry.js';

// Multi-layer grid: identical X/Z cells can contain several independent floor heights.
// Deliberately checks walking only; ladders, moving surfaces and mesh interiors are not simulated.
export function analyzeWalkability(objects, { cellSize = 0.5, maxCells = 50000, maxNodes = 120000, skipTraversal = false } = {}) {
  const surfaces = objects.filter(isWalkable);
  const starts = objects.filter(o => o.role === 'spawn');
  const targets = objects.filter(o => ['goal', 'checkpoint', 'exit', 'objective'].includes(o.role) || (starts.length > 1 && o.role === 'spawn'));
  const notes = [];
  if (objects.some(o => !isUpright(o) || o.role === 'slope' || o.role === 'moving_platform' || (o.role === 'climb' && o.variant === 2))) notes.push('傾斜・はしご・動く足場は歩行検証の対象外です。');
  if (objects.some(o => o.customModelUrl || ['building', 'tower', 'terrain'].includes(o.role))) notes.push('モデルの内部や地形の凹凸は箱による近似です。');
  const result = { status: 'unavailable', reachable: [], unreachable: [], issues: [], notes, levels: 0 };
  if (!surfaces.length) return result;
  const heights = surfaces.filter(o => o.role !== 'climb').map(o => o.pos[1] + o.size[1] / 2).sort((a, b) => a - b);
  result.levels = heights.reduce((levels, y) => { if (!levels.length || y - levels.at(-1) > WALKING.stepHeight) levels.push(y); return levels; }, []).length;
  if (skipTraversal) return { ...result, notes: [...notes, 'このステージは「現在のマップを再確認」で通行と視線を検査します。'] };
  if (!starts.length) return result;
  const bounds = surfaces.map(getBounds);
  const minX = Math.floor(Math.min(...bounds.map(b => b.minX)) / cellSize);
  const maxX = Math.ceil(Math.max(...bounds.map(b => b.maxX)) / cellSize);
  const minZ = Math.floor(Math.min(...bounds.map(b => b.minZ)) / cellSize);
  const maxZ = Math.ceil(Math.max(...bounds.map(b => b.maxZ)) / cellSize);
  if ((maxX - minX + 1) * (maxZ - minZ + 1) > maxCells) return { ...result, status: 'limited', notes: [...notes, '範囲が大きいため経路検証を省略しました。'] };
  const world = createSpatialWorld(objects);
  const key = (x, z, y) => `${x}:${z}:${Math.round(y * 10000)}`;
  const states = new Map();
  const at = (x, z) => {
    const k = `${x}:${z}`;
    if (!states.has(k)) states.set(k, [...new Set(world.heights(x * cellSize, z * cellSize))].filter(y => !world.blocked(x * cellSize, z * cellSize, y) && !world.dangerous(x * cellSize, z * cellSize, y)));
    return states.get(k);
  };
  const canWalk = (ax, az, ay, bx, bz, by) => {
    let y = ay;
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.1));
    for (let i = 1; i <= steps; i++) {
      const x = ax + (bx - ax) * i / steps, z = az + (bz - az) * i / steps;
      const next = world.floor(x, z, y);
      if (!Number.isFinite(next) || y - next > WALKING.stepHeight + 1e-5 || world.dangerous(x, z, next)) return false;
      y = next;
    }
    return Math.abs(y - by) < 0.01;
  };
  const anchors = object => {
    const x = Math.round(object.pos[0] / cellSize), z = Math.round(object.pos[2] / cellSize);
    const y = world.floor(object.pos[0], object.pos[2], object.pos[1] - object.size[1] / 2);
    if (!Number.isFinite(y) || world.dangerous(object.pos[0], object.pos[2], y)) return [];
    const found = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      for (const h of at(x + dx, z + dz)) {
        if (canWalk(object.pos[0], object.pos[2], y, (x + dx) * cellSize, (z + dz) * cellSize, h)) found.push([x + dx, z + dz, h]);
      }
    }
    return found;
  };
  const targetAnchors = targets.map(o => ({ object: o, keys: anchors(o).map(([x, z, y]) => key(x, z, y)) }));
  let limited = false;
  for (const start of starts) {
    const queue = anchors(start), visited = new Set(queue.map(([x, z, y]) => key(x, z, y)));
    for (let i = 0; i < queue.length; i++) {
      if (visited.size > maxNodes) { limited = true; break; }
      const [x, z, y] = queue[i];
      if (!targetAnchors.length || targetAnchors.every(t => t.keys.some(k => visited.has(k)))) break;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < minX || nx > maxX || nz < minZ || nz > maxZ) continue;
        for (const h of at(nx, nz)) {
          const k = key(nx, nz, h);
          if (!visited.has(k) && canWalk(x * cellSize, z * cellSize, y, nx * cellSize, nz * cellSize, h)) { visited.add(k); queue.push([nx, nz, h]); }
        }
      }
    }
    if (!queue.length) result.issues.push(`${start.id}: スタートに立てる床がありません。`);
    for (const target of targetAnchors) {
      if (target.object.id === start.id) continue;
      const pair = { from: start.id, to: target.object.id };
      if (target.keys.some(k => visited.has(k))) result.reachable.push(pair);
      else if (!limited) { result.unreachable.push(pair); result.issues.push(`${start.id} から ${target.object.id} への歩行経路を確認できません。階段・床の接続と頭上の余裕を確認してください。`); }
    }
  }
  result.status = limited ? 'limited' : result.issues.length ? 'warning' : targets.length ? 'checked' : 'no-targets';
  return result;
}

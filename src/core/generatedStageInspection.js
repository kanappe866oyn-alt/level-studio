import { analyzeWalkability } from './walkability.js';
import { createSpatialWorld, isWalkable, surfaceTop, worldXZ, boxesOverlap, getCollisionParts } from './spatialGeometry.js';
import ASSETS from '../assets.json' with { type: 'json' };

// Inspection markers are temporary: never add gameplay objects or change a user's
// requested counts just to make a scene testable.
export function inspectGeneratedNavigation(objects) {
  const world = createSpatialWorld(objects);
  const terrain = objects.find(o => o.id === '__generated_terrain' && o.terrainProfile?.surfaceGrid);
  const surfaces = objects.filter(o => isWalkable(o) && o.role !== 'climb' && !(o.role === 'ground' && terrain &&
    o.rot.every(v => v === 0) && terrain.rot.every(v => v === 0) && o.pos[0] === terrain.pos[0] && o.pos[2] === terrain.pos[2] &&
    o.size[0] <= terrain.size[0] && o.size[2] <= terrain.size[2] && o.pos[1] + o.size[1]/2 <= terrain.pos[1] - terrain.size[1]/2 + 1e-6));
  const markers = [];
  const issues = [];
  if (!surfaces.length) issues.push('歩行可能な床がありません。');
  for (const stair of objects.filter(o => o.role === 'climb' && o.variant !== 2)) {
    const blockers = new Set();
    for (const step of getCollisionParts(stair)) {
      const y = step.pos[1] + step.size[1] / 2;
      if (!world.blocked(step.pos[0], step.pos[2], y)) continue;
      for (const other of objects.filter(o => o.id !== stair.id)) {
        if (createSpatialWorld([other]).blocked(step.pos[0], step.pos[2], y)) blockers.add(other.id);
      }
    }
    if (blockers.size) issues.push(`${stair.id}: 階段途中の通行・頭上を ${[...blockers].join(', ')} が塞いでいます。これらを階段の外へ移すか開口を設け、頭上1.8m以上を確保してください。`);
    for (const end of [-1, 1]) {
      const y = stair.pos[1] + end * stair.size[1] / 2;
      for (const lateral of [-0.5, 0, 0.5]) {
        const [x, z] = worldXZ(stair, lateral * Math.max(0, stair.size[0] - 0.8), end * (stair.size[2] / 2 + 0.38));
        const support = surfaces.some(s => { const top = surfaceTop(s, x, z); return Number.isFinite(top) && Math.abs(top - y) <= 0.12; });
        if (!support || world.blocked(x, z, y) || world.dangerous(x, z, y)) {
          issues.push(`${stair.id}: 階段${end < 0 ? '下' : '上'}端の踊り場が未接続または閉塞しています。段端と床上面を12cm以内で接続し、通行幅を確保してください。`);
          break;
        }
      }
    }
  }
  for (const surface of surfaces) {
    if (surface.size[0] < 1 || surface.size[2] < 1) continue;
    let point;
    const samples = [0, -0.25, 0.25, -0.42, 0.42];
    for (const [u, v] of samples.flatMap(u => samples.map(v => [u, v]))) {
      const [x, z] = worldXZ(surface, surface.size[0] * u, surface.size[2] * v);
      const y = surfaceTop(surface, x, z);
      if (Number.isFinite(y) && !world.blocked(x, z, y) && !world.dangerous(x, z, y)) { point = [x, y + 0.05, z]; break; }
    }
    if (point) markers.push({ id: `__inspection_${surface.id}`, role: 'checkpoint', type: 'box', pos: point, size: [0.1, 0.1, 0.1], rot: [0, 0, 0] });
    else issues.push(`${surface.id}: 歩ける床面を確認できません。床を覆う建物・水・頭上の障害物を確認してください。`);
  }
  const starts = objects.filter(o => o.role === 'spawn');
  if (!starts.length && markers.length) markers[0] = { ...markers[0], role: 'spawn' };
  const augmented = [...objects, ...markers];
  const forward = analyzeWalkability(augmented);
  // Reverse the graph traversal too: a one-way drop is not a stair connection.
  const reverse = markers.length > 1 ? analyzeWalkability(augmented.map(o => o.id === markers.at(-1).id ? { ...o, role: 'spawn' } : o.role === 'spawn' ? { ...o, role: 'checkpoint' } : o)) : null;
  issues.push(...forward.issues, ...(reverse?.issues || []));
  if (!['checked', 'no-targets'].includes(forward.status) || reverse && !['checked', 'no-targets'].includes(reverse.status)) issues.push('主要床への往復歩行を検証できませんでした。検証範囲または接続を調整してください。');
  return { status: issues.length ? 'warning' : 'checked', surfaces: markers.length, issues: [...new Set(issues)], notes: forward.notes };
}

export function generatedPlacementIssues(objects, { allowFloating = false } = {}) {
  // Only unambiguous duplicate volumes: normal touching floors, foundations and
  // facade kits deliberately intersect and are not treated as collisions here.
  const solids = objects.filter(o => ['building', 'tree', 'rock', 'tower'].includes(o.role) && !o.buildingPlacement && !o.spatialAppearance);
  const issues = [];
  const supports = objects.filter(isWalkable);
  if (!allowFloating) for (const object of objects) {
    if (!ASSETS.SEMANTIC_PREFABS[object.role]?.groundSnap || object.modelGrounding || object.buildingPlacement || object.spatialAppearance) continue;
    const bottom = object.pos[1] - object.size[1] / 2;
    const heights = supports.filter(s => s.id !== object.id).map(s => surfaceTop(s, object.pos[0], object.pos[2])).filter(Number.isFinite);
    const gap = heights.length ? heights.map(y => bottom - y).sort((a, b) => Math.abs(a) - Math.abs(b))[0] : Infinity;
    
    if (object.role === 'building') {
      const unsupported = [-.5,0,.5].some(u => [-.5,0,.5].some(v => {
        const [x,z]=worldXZ(object,object.size[0]*u,object.size[2]*v);
        return !supports.some(s=>s.id!==object.id && Number.isFinite(surfaceTop(s,x,z)) && Math.abs(bottom-surfaceTop(s,x,z))<=.12);
      }));
      if (unsupported) issues.push(`${object.id}: 建物の底面全体を支持できません。実寸と向きに合った平場が必要です。`);
    }
    const inset = ['rock', 'cliff'].includes(object.role) ? Math.min(1, object.size[1] * 0.3) : 0.12;
    if (gap > 0.12 || gap < -inset) issues.push(`${object.id}: 接地不良（下面と支持面の差=${Number.isFinite(gap) ? gap.toFixed(2) : '支持面なし'}m）。浮き・埋まりを修正してください。`);
  }
  for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) {
    const a = solids[i], b = solids[j];
    if (a.role !== b.role || !boxesOverlap(a, b)) continue;
    if (a.pos.every((v, k) => Math.abs(v - b.pos[k]) < Math.min(a.size[k], b.size[k]) * 0.2)) issues.push(`${a.id}/${b.id}: 同種モデルがほぼ同じ位置で重複しています。間隔を確保してください。`);
  }
  return issues;
}

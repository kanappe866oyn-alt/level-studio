import { getCollisionParts, localXZ } from './spatialGeometry.js';
import { PLAYER_EYE_HEIGHT } from './worldScale.js';
import { terrainMeshData, terrainContainsAtHeight } from './terrainSurface.js';
import { isSpatialRailing } from './railingParts.js';

function hitsTerrain(a, b, object) {
  if (terrainContainsAtHeight(object, ...a) || terrainContainsAtHeight(object, ...b)) return true;
  const data = terrainMeshData(object), p = data.positions;
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const candidates = new Set();
  // Visit every crossed grid interval, including rays exactly on a grid line.
  // Terrain bins contain the actual (possibly irregular) triangles.
  const times = [0, 1];
  for (const [axis, step] of [[0, data.cellX], [2, data.cellZ]]) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-10) continue;
    const min = Math.max(-object.size[axis] / 2 - step, Math.min(a[axis], b[axis]));
    const max = Math.min(object.size[axis] / 2 + step, Math.max(a[axis], b[axis]));
    for (let k = Math.ceil(min / step); k <= Math.floor(max / step); k++) {
      const t = (k * step - a[axis]) / delta;
      if (t > 0 && t < 1) times.push(t);
    }
  }
  times.sort((x, y) => x - y);
  for (let i = 0; i < times.length - 1; i++) {
    const t = (times[i] + times[i + 1]) / 2, x = a[0] + dx * t, z = a[2] + dz * t;
    for (const ox of [-1e-7, 1e-7]) for (const oz of [-1e-7, 1e-7]) {
      for (const triangle of data.bins.get(`${Math.floor((x + ox) / data.cellX)}:${Math.floor((z + oz) / data.cellZ)}`) || []) candidates.add(triangle);
    }
  }
  for (const triangle of data.boundaryTriangles) candidates.add(triangle);
  for (const [ia, ib, ic] of candidates) {
    const k = ia * 3, l = ib * 3, m = ic * 3;
    const ex = p[l] - p[k], ey = p[l + 1] - p[k + 1], ez = p[l + 2] - p[k + 2];
    const fx = p[m] - p[k], fy = p[m + 1] - p[k + 1], fz = p[m + 2] - p[k + 2];
    const hx = dy * fz - dz * fy, hy = dz * fx - dx * fz, hz = dx * fy - dy * fx;
    const det = ex * hx + ey * hy + ez * hz;
    if (Math.abs(det) < 1e-10) continue;
    const sx = a[0] - p[k], sy = a[1] - p[k + 1], sz = a[2] - p[k + 2];
    const u = (sx * hx + sy * hy + sz * hz) / det;
    if (u < -1e-8 || u > 1 + 1e-8) continue;
    const qx = sy * ez - sz * ey, qy = sz * ex - sx * ez, qz = sx * ey - sy * ex;
    const v = (dx * qx + dy * qy + dz * qz) / det;
    if (v < -1e-8 || u + v > 1 + 1e-8) continue;
    const t = (fx * qx + fy * qy + fz * qz) / det;
    if (t > 0.00001 && t < 0.99999) return true;
  }
  return false;
}

// Segment against a yaw-aware box using slab intervals. This runs on the same
// collision parts used for walking, rather than on the planned connection graph.
export function segmentHitsBox(from, to, object) {
  if (isSpatialRailing(object)) return getCollisionParts(object).some(part => segmentHitsBox(from, to, part));
  const aXZ = localXZ(object, from[0], from[2]), bXZ = localXZ(object, to[0], to[2]);
  const a = [aXZ[0], from[1] - object.pos[1], aXZ[1]], b = [bXZ[0], to[1] - object.pos[1], bXZ[1]];
  let low = 0.00001, high = 0.99999;
  for (let axis = 0; axis < 3; axis++) {
    const half = object.size[axis] / 2, delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-9) { if (a[axis] < -half || a[axis] > half) return false; }
    else {
      const first = (-half - a[axis]) / delta, second = (half - a[axis]) / delta;
      low = Math.max(low, Math.min(first, second)); high = Math.min(high, Math.max(first, second));
      if (low > high) return false;
    }
  }
  return low <= high && (object.role === 'landform' && object.terrainProfile && !object.customModelUrl ? hitsTerrain(a, b, object) : true);
}
export function spatialEyeSamples(a) {
  return [-0.3, 0, 0.3].flatMap(dx => [-0.3, 0, 0.3].map(dz => [a.x + dx * a.width, a.y + PLAYER_EYE_HEIGHT, a.z + dz * a.depth]));
}
export function inspectSpatialSightlines(objects, areas, conditions) {
  const blockers = objects.flatMap(getCollisionParts);
  return conditions.map(s => {
    const a = areas.find(a => a.id === s.from), b = areas.find(a => a.id === s.to);
    if (!a || !b) throw new Error('視線の対象エリアが見つかりません。');
    let visible = 0, total = 0, maxVisibleDistance = 0, longestSegment = null;
    for (const from of spatialEyeSamples(a)) for (const to of spatialEyeSamples(b)) {
      total++; if (!blockers.some(o => segmentHitsBox(from, to, o))) {
        visible++;
        const length = Math.hypot(...from.map((v, i) => v - to[i]));
        if (length > maxVisibleDistance) { maxVisibleDistance = length; longestSegment = { from, to }; }
      }
    }
    const ratio = visible / total;
    return { ...s, visibleSamples: visible, totalSamples: total, ratio, maxVisibleDistance, longestSegment, passed: s.relation === 'visible' ? ratio >= 0.2 : visible === 0 };
  });
}

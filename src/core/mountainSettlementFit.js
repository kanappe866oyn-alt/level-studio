import { getBounds, worldXZ } from './spatialGeometry.js';
import { terrainMeshData } from './terrainSurface.js';

const meshes = new WeakMap();
function worldMesh(mountain) {
  if (meshes.has(mountain)) return meshes.get(mountain);
  const data = terrainMeshData(mountain), vertices = [];
  for (let k = 0; k < data.positions.length / 3; k++) {
    const [x, z] = worldXZ(mountain, data.positions[k * 3], data.positions[k * 3 + 2]);
    vertices.push([x, data.positions[k * 3 + 1] + mountain.pos[1], z]);
  }
  const mesh = { triangles: data.triangles, vertices };
  meshes.set(mountain, mesh);
  return mesh;
}

// Clip the actual top triangles, rather than sampling a few points or treating
// the entire mountain bounding box as solid. Interpolated Y stays on each face.
function clip(polygon, axis, limit, sign) {
  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const da = sign * (a[axis] - limit), db = sign * (b[axis] - limit);
    if (da >= 0) result.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      result.push(a.map((value, k) => value + (b[k] - value) * t));
    }
  }
  return result;
}

export function mountainSettlementClearance(mountain, objects, margin = 0.7) {
  const bounds = getBounds(mountain), bottom = mountain.pos[1] - mountain.size[1] / 2;
  const nearby = objects.map(object => ({ object, bounds: getBounds(object) })).filter(({ object, bounds: b }) =>
    object.pos[1] + object.size[1] / 2 > bottom &&
    b.maxX + margin > bounds.minX && b.minX - margin < bounds.maxX &&
    b.maxZ + margin > bounds.minZ && b.minZ - margin < bounds.maxZ);
  if (!nearby.length) return { passed: true, testedObjects: 0 };
  const { triangles, vertices } = worldMesh(mountain);
  for (const { object, bounds: b } of nearby) {
    const ceiling = object.pos[1] - object.size[1] / 2 - 0.12;
    for (const tri of triangles) {
      let polygon = tri.map(k => vertices[k]);
      if (polygon.every(p => p[1] < ceiling) || polygon.every(p => p[0] < b.minX - margin) ||
        polygon.every(p => p[0] > b.maxX + margin) || polygon.every(p => p[2] < b.minZ - margin) ||
        polygon.every(p => p[2] > b.maxZ + margin)) continue;
      for (const [axis, limit, sign] of [[0, b.minX - margin, 1], [0, b.maxX + margin, -1],
        [2, b.minZ - margin, 1], [2, b.maxZ + margin, -1]]) polygon = clip(polygon, axis, limit, sign);
      if (polygon.some(p => p[1] >= ceiling)) return { passed: false, obstruction: object.id, testedObjects: nearby.length };
    }
  }
  return { passed: true, testedObjects: nearby.length };
}

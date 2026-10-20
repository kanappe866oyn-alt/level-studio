import { Box3, Triangle, Vector3 } from 'three';
import { localXZ, worldXZ, boxesOverlap } from './spatialGeometry.js';
import { terrainMeshData, terrainContainsAtHeight } from './terrainSurface.js';

// Exact surface intersection plus containment for a filled terrain and a yawed
// box. A tall ramp's bounding box is not its occupied volume at the low end.
export function terrainBoxOverlap(box, terrain) {
  if (!boxesOverlap(box, terrain)) return false;
  if (terrain.role !== 'landform' || !terrain.terrainProfile || terrain.customModelUrl) return true;
  const [cx, cz] = localXZ(terrain, box.pos[0], box.pos[2]);
  if (terrainContainsAtHeight(terrain, cx, box.pos[1] - terrain.pos[1], cz)) return true;
  const data = terrainMeshData(terrain), p = data.positions;
  const bounds = new Box3(new Vector3(...box.size.map(v => -v / 2 + 1e-5)), new Vector3(...box.size.map(v => v / 2 - 1e-5)));
  const point = index => {
    const [wx, wz] = worldXZ(terrain, p[index * 3], p[index * 3 + 2]), [x, z] = localXZ(box, wx, wz);
    return new Vector3(x, terrain.pos[1] + p[index * 3 + 1] - box.pos[1], z);
  };
  const vertices = new Map();
  const vertex = index => { if (!vertices.has(index)) vertices.set(index, point(index)); return vertices.get(index); };
  const triangle = new Triangle();
  for (let i = 0; i < data.indices.length; i += 3) {
    triangle.set(vertex(data.indices[i]), vertex(data.indices[i + 1]), vertex(data.indices[i + 2]));
    if (bounds.intersectsTriangle(triangle)) return true;
  }
  return false;
}

import { Color } from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

export function rockStrataColors(data, object) {
  const neighbours = new Map();
  for (const tri of data.triangles) for (const k of tri) {
    if (!neighbours.has(k)) neighbours.set(k, new Set());
    for (const j of tri) if (j !== k) neighbours.get(k).add(j);
  }
  const stone = new Color(object.color || '#929b96'), shadow = new Color('#505b56'), foot = new Color('#708868');
  const colors = [];
  for (let k = 0; k < data.positions.length / 3; k++) {
    const [x, y, z] = data.positions.slice(k * 3, k * 3 + 3), worldY = y + object.pos[1];
    const adjacent = [...(neighbours.get(k) || [])];
    const hollow = adjacent.length ? adjacent.reduce((sum, j) => sum + data.positions[j * 3 + 1] - y, 0) / adjacent.length : 0;
    const seam = Math.min(0.42, Math.max(0, hollow) * 0.22);
    const color = stone.clone().lerp(shadow, seam).lerp(foot, Math.max(0, Math.min(0.6, (-worldY + 1) / 14)));
    color.multiplyScalar(0.94 + 0.045 * Math.sin(worldY * 1.1 + x * 0.13) + 0.025 * Math.sin(x * 0.7 + z * 0.4));
    colors.push(color.r, color.g, color.b);
  }
  return colors;
}

// Split normals only at substantial changes of plane. Positions and triangles
// stay identical to the physical terrain; the same normals survive GLB export.
export function finishRockStrataGeometry(geometry, object) {
  if (!object.terrainProfile?.rockStrata) return geometry;
  const finished = toCreasedNormals(geometry, Math.PI / 7);
  if (finished !== geometry) geometry.dispose();
  return finished;
}

import { surfaceTop, worldXZ } from './spatialGeometry.js';
import { terrainMeshData } from './terrainSurface.js';

export function terrainPerimeterSamples(terrain) {
  const grid = terrain.terrainProfile.surfaceGrid, data = terrainMeshData(terrain), corners = [];
  const indices = [];
  for (let i = 0; i < grid.columns; i++) indices.push([i, 0]);
  for (let j = 1; j < grid.rows; j++) indices.push([grid.columns - 1, j]);
  for (let i = grid.columns - 2; i >= 0; i--) indices.push([i, grid.rows - 1]);
  for (let j = grid.rows - 2; j > 0; j--) indices.push([0, j]);
  for (const [i, j] of indices) {
    const k = (j * grid.columns + i) * 3;
    const [x, z] = worldXZ(terrain, data.positions[k], data.positions[k + 2]);
    corners.push({ x, z, y: data.positions[k + 1] + terrain.pos[1] });
  }
  const samples = [];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i], b = corners[(i + 1) % corners.length], count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25));
    for (let j = 0; j < count; j++) {
      const t = j / count;
      samples.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return samples;
}

export function inspectMountainFootJoin(before, after, terrain, perimeter = terrainPerimeterSamples(terrain)) {
  const samples = [];
  for (const p of perimeter) {
    const a = surfaceTop(before, p.x, p.z), b = surfaceTop(after, p.x, p.z);
    if (a === null || b === null || a >= p.y - 0.25) continue;
    samples.push({ x: p.x, z: p.z, soil: p.y, before: a, after: b });
  }
  return { samples: samples.length, beforeMaxDeficit: Math.max(0, ...samples.map(p => p.soil - p.before)),
    afterMaxDeficit: Math.max(0, ...samples.map(p => p.soil - p.after)) };
}

// Raise only the mountain's foot to the existing soil. The original landscape,
// floors, buildings and props stay unchanged. Outside soil, a low talus apron
// descends from the nearest actual (irregular) terrain edge.
export function joinMountainFoot(mountain, terrain) {
  const data = terrainMeshData(mountain), grid = mountain.terrainProfile.surfaceGrid;
  const perimeter = terrainPerimeterSamples(terrain), bottom = mountain.pos[1] - mountain.size[1] / 2;
  const heights = [...grid.heights];
  let raised = 0;
  for (let k = 0; k < grid.columns * grid.rows; k++) {
    const [x, z] = worldXZ(mountain, data.positions[k * 3], data.positions[k * 3 + 2]);
    let soil = surfaceTop(terrain, x, z);
    if (soil === null) {
      let distance = Infinity, nearest;
      for (const p of perimeter) {
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < distance) { distance = d; nearest = p; }
      }
      soil = nearest.y - distance * 0.45;
    }
    const target = Math.min(1, Math.max(0.01, (soil + 0.08 - bottom) / mountain.size[1]));
    if (target > heights[k]) { heights[k] = target; raised++; }
  }
  const object = { ...mountain, terrainProfile: { ...mountain.terrainProfile, surfaceGrid: { ...grid, heights } } };
  return { object, report: { raisedVertices: raised, ...inspectMountainFootJoin(mountain, object, terrain, perimeter) } };
}

import { getBounds, getCollisionParts, isWalkable, localXZ, surfaceTop, worldXZ, WALKING } from './spatialGeometry.js';
import { terrainContour } from './terrainContours.js';

// The envelope joins the designed soil masses; lower circulation cuts valleys
// through it. Every cell touching a route reserves its original walking volume.
export function buildTerrainSurround(objects) {
  // A thin elevated deck does not imply a hill beneath it. Only filled terrain
  // masses shape the landscape; all floors still reserve their standing space.
  const sources = objects.filter(o => o.role === 'landform' && o.id !== 'sp_terrain_surround' && !o.id.endsWith('_soil') && o.size[1] >= 1);
  if (!sources.length) return null;
  const protectedFloors = objects.filter(o => isWalkable(o) && !['sp_ground', 'sp_terrain_surround'].includes(o.id) && !o.id.endsWith('_soil')).flatMap(getCollisionParts);
  const bounds = protectedFloors.map(getBounds), apron = 7;
  const minX = Math.min(...bounds.map(b => b.minX)) - apron, maxX = Math.max(...bounds.map(b => b.maxX)) + apron;
  const minZ = Math.min(...bounds.map(b => b.minZ)) - apron, maxZ = Math.max(...bounds.map(b => b.maxZ)) + apron;
  const width = maxX - minX, depth = maxZ - minZ;
  const columns = Math.min(129, Math.ceil(width / 0.8) + 1), rows = Math.min(129, Math.ceil(depth / 0.8) + 1);
  const bottom = -5, top = Math.max(...sources.map(o => o.pos[1] + o.size[1] / 2)) + 0.2;
  const cell = Math.max(width / (columns - 1), depth / (rows - 1));
  const reserve = cell * 2 + WALKING.radius;
  const datum = Math.min(0, ...sources.map(o => o.pos[1] + o.size[1] / 2 - (o.terrainProfile?.grade || 0)));
  const contours = new Map(protectedFloors.filter(o => o.terrainProfile?.cornerCut || o.terrainProfile?.widthScale || o.terrainProfile?.curve).map(o => [o.id, terrainContour(o)]));
  const nearest = (o, x, z) => {
    const [lx, lz] = localXZ(o, x, z);
    let cx = Math.max(-o.size[0] / 2, Math.min(o.size[0] / 2, lx)), cz = Math.max(-o.size[2] / 2, Math.min(o.size[2] / 2, lz));
    let [wx, wz] = worldXZ(o, cx, cz), top = surfaceTop(o, wx, wz);
    const contour = contours.get(o.id);
    if (top === null && contour) {
      let distance = Infinity;
      contour.forEach(([ax, az], i) => {
        const [bx, bz] = contour[(i + 1) % contour.length], dx = bx - ax, dz = bz - az;
        const t = Math.max(0, Math.min(1, ((lx - ax) * dx + (lz - az) * dz) / (dx * dx + dz * dz)));
        const px = ax + t * dx, pz = az + t * dz, d = Math.hypot(lx - px, lz - pz);
        if (d < distance) { distance = d; cx = px; cz = pz; }
      });
      [wx, wz] = worldXZ(o, cx, cz); top = surfaceTop(o, wx, wz);
    }
    return { distance: Math.hypot(lx - cx, lz - cz), top };
  };
  const heights = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
    const x = minX + width * i / (columns - 1), z = minZ + depth * j / (rows - 1);
    const valley = -3.25 + 0.12 * Math.sin(x * 0.23) * Math.cos(z * 0.19);
    let y = valley;
    for (const o of sources) {
      const p = nearest(o, x, z);
      if (p.top === null || p.distance > apron) continue;
      const t = Math.min(1, p.distance / (apron - 0.35 + 0.3 * Math.sin(x * 0.31 + z * 0.17)));
      const blend = 1 - t * t * (3 - 2 * t);
      // Reveal retaining walls rather than burying them under grass all the way
      // to the paving. Higher terraces leave proportionally more exposed stone.
      const shoulder = p.top - Math.max(0.35, (p.top - datum) * 0.65);
      y = Math.max(y, valley + (shoulder - valley) * blend - 0.12);
    }
    for (const o of protectedFloors) {
      const p = nearest(o, x, z);
      // A continuous height envelope replaces the former abrupt cutoff at
      // `reserve`, which could produce a spike one grid cell beyond a street.
      if (p.top !== null) y = Math.min(y, p.top - 0.18 + Math.max(0, p.distance - reserve) * 0.6);
    }
    heights.push((Math.max(bottom + 0.1, Math.min(top, y)) - bottom) / (top - bottom));
  }
  return { id: 'sp_terrain_surround', name: '経路に沿う裾と谷の地形', role: 'landform', type: 'box',
    pos: [(minX + maxX) / 2, (bottom + top) / 2, (minZ + maxZ) / 2], size: [width, top - bottom, depth], rot: [0, 0, 0],
    variant: 1, material: 0, color: '#98a18b', color2: '#82786b',
    terrainProfile: { seed: 17, relief: 0, edgeRoughness: 0.12, surfaceMaterial: 'grass', surfaceBlend: 'slope', surfaceGrid: { columns, rows, heights } } };
}

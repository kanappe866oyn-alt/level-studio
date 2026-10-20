import { getModelDefault } from './modelCatalog.js';
import { sampleTerrain } from './terrainSurface.js';
import { getBounds, worldXZ } from './spatialGeometry.js';

function randomSequence(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

export function natureTint(hex, amount) {
  const rgb = hex.match(/[\da-f]{2}/gi).map(v => parseInt(v, 16));
  return '#' + rgb.map(v => Math.round(v + (amount >= 0 ? 255 - v : v) * amount).toString(16).padStart(2, '0')).join('');
}

// A few small ecological groups, with an open walking cross through each terrace.
// Rounded crowns frame groves; pines and small saplings provide a taller silhouette.
// Every candidate checks its full yawed footprint against terrain and route reservations.
export function dressNatureTerrace(land, plan, level, reservedObjects = []) {
  const random = randomSequence(land.terrainProfile.seed + 701);
  const [width, , depth] = land.size, shoreSide = land.terrainProfile.shoreline.side;
  const objects = [];
  const forestSign = random() < 0.5 ? -1 : 1;
  const densityLimit = { sparse: 4, balanced: 8, dense: 13 }[plan.density];
  const zones = [
    { name: '外縁の木立', x: -shoreSide * width * 0.32, z: forestSign * depth * 0.29, role: 'tree' },
    { name: '岸辺の岩群', x: shoreSide * width * 0.34, z: -forestSign * depth * 0.29, role: 'rock' },
    { name: level === 2 ? '展望地の岩群' : '崖際の木立', x: -shoreSide * width * 0.32, z: -forestSign * depth * 0.29, role: level === 2 ? 'rock' : 'tree' },
    { name: '岸辺の若木', x: shoreSide * width * 0.32, z: forestSign * depth * 0.29, role: 'tree', small: true },
  ];
  // Mid-level woodland is dominant; low/high levels favour shoreline/outcrop groups.
  const order = level === 1 ? [0, 2, 1, 0, 3, 2, 1, 0, 2, 3, 0, 1, 2] : [1, 0, 2, 1, 3, 2, 0, 1, 2, 3, 1, 0, 2];
  for (let slot = 0; slot < densityLimit; slot++) {
    const zone = zones[order[slot]];
    const choice = random();
    const variant = zone.role === 'tree'
      ? (zone.small ? (choice < 0.5 ? 1 : 4) : zone.name === '外縁の木立' ? 11 : choice < 0.5 ? 4 : 11)
      : (level === 2 && zone.name === '展望地の岩群' ? (choice < 0.5 ? 3 : 4) : (choice < 0.5 ? 1 : 2));
    const ref = getModelDefault(zone.role, variant);
    const matureTree = zone.role === 'tree' && !zone.small;
    const footprint = Math.min(matureTree ? 5.2 : zone.role === 'tree' ? 4.2 : 3.4,
      width * (matureTree ? 0.21 : 0.18), depth * (matureTree ? 0.25 : 0.22)) *
      (zone.small ? 0.48 : 0.72 + random() * 0.28);
    const scale = Math.min(1, footprint / ref.size[0], footprint / ref.size[2], (zone.role === 'tree' ? 6 : 3.4) / ref.size[1]);
    const baseSize = ref.size.map(v => v * scale);
    if (zone.role === 'tree') baseSize[1] = zone.small
      ? Math.min(3.5, baseSize[1] * 1.2)
      : Math.min(7.5, Math.max(3.5, baseSize[1] * 1.45));
    const yaw = random() * Math.PI * 2;
    const color = natureTint(zone.role === 'tree' ? plan.foliageColor : plan.rockColor, (random() - 0.5) * 0.16);
    for (let attempt = 0; attempt < 36; attempt++) {
      // Keep the taller silhouette, but narrow the crown if the full footprint will
      // not fit beside a trail/plaza. Try the larger crown first on every terrace.
      const fit = matureTree ? [1, 0.88, 0.76][Math.floor(attempt / 12)] : 1;
      const size = [baseSize[0] * fit, baseSize[1], baseSize[2] * fit];
      const dx = zone.x + (random() - 0.5) * width * 0.24;
      const dz = zone.z + (random() - 0.5) * depth * 0.28;
      const surface = sampleTerrain(land, dx, dz);
      if (surface === null) continue;
      const candidate = { id: `${land.id}_${zone.role}_${slot}`, name: zone.name, role: zone.role, type: 'box',
        pos: [land.pos[0] + dx, land.pos[1] + surface + size[1] / 2, land.pos[2] + dz], size, rot: [0, yaw, 0],
        color, variant, material: 0, modelDimensions: { path: ref.path, size: [...ref.bounds.size], defaultScale: ref.scale } };
      const bounds = getBounds(candidate), cx = land.pos[0], cz = land.pos[2];
      // Keep the whole model away from the main path and the 4m-wide bridge axis.
      if ((bounds.minX < cx + 2.1 && bounds.maxX > cx - 2.1) || (bounds.minZ < cz + 2.6 && bounds.maxZ > cz - 2.6)) continue;
      if (bounds.minX < cx - width / 2 + 0.3 || bounds.maxX > cx + width / 2 - 0.3 ||
          bounds.minZ < cz - depth / 2 + 0.3 || bounds.maxZ > cz + depth / 2 - 0.3) continue;
      // Check corners and edge midpoints for drop-offs or excessive surface slope.
      const supportPoints = [[0, 0], ...[-1, 0, 1].flatMap(x => [-1, 0, 1].map(z => [x * size[0] / 2, z * size[2] / 2]))];
      if (!supportPoints.every(([x, z]) => {
        const [wx, wz] = worldXZ(candidate, x, z);
        const y = sampleTerrain(land, wx - cx, wz - cz);
        return y !== null && Math.abs(y - surface) <= 0.18;
      })) continue;
      // A small gap between full footprints keeps clusters readable and walkable.
      if ([...reservedObjects, ...objects].some(o => {
        const b = getBounds(o);
        return bounds.minX < b.maxX + 0.35 && bounds.maxX > b.minX - 0.35 && bounds.minZ < b.maxZ + 0.35 && bounds.maxZ > b.minZ - 0.35;
      })) continue;
      objects.push(candidate); break;
    }
  }
  return objects;
}

// Small understory belongs to existing groves/outcrops; it never fills the walking cross.
export function dressNatureUnderstory(land, plan, mainObjects, reservedObjects = []) {
  const anchors = [...mainObjects.filter(o => o.role === 'tree'), ...mainObjects.filter(o => o.role === 'rock')].slice(0, 3);
  if (!anchors.length) return [];
  const random = randomSequence(land.terrainProfile.seed + 1709), objects = [];
  const [width, , depth] = land.size, [cx, , cz] = land.pos;
  const count = { sparse: 3, balanced: 6, dense: 10 }[plan.density];
  for (let slot = 0; slot < count; slot++) {
    const anchor = anchors[slot % anchors.length], variant = slot % 3 === 0 ? 5 : 1;
    const ref = getModelDefault('plant', variant), footprint = 0.65 + random() * 0.5;
    const scale = Math.min(footprint / ref.size[0], footprint / ref.size[2], 0.8 / ref.size[1]);
    const size = ref.size.map(v => v * scale), yaw = random() * Math.PI * 2;
    for (let attempt = 0; attempt < 40; attempt++) {
      const angle = random() * Math.PI * 2, distance = Math.max(anchor.size[0], anchor.size[2]) / 2 + 0.65 + random() * 1.1;
      const dx = anchor.pos[0] - cx + Math.cos(angle) * distance, dz = anchor.pos[2] - cz + Math.sin(angle) * distance;
      const y = sampleTerrain(land, dx, dz);
      if (y === null) continue;
      const candidate = { id: `${land.id}_plant_${slot}`, name: variant === 5 ? '木立の足元の低木' : '岩と木立に沿う草', role: 'plant', type: 'box',
        pos: [cx + dx, land.pos[1] + y + size[1] / 2, cz + dz], size, rot: [0, yaw, 0], color: natureTint(plan.foliageColor, 0.08), variant, material: 0,
        modelDimensions: { path: ref.path, size: [...ref.bounds.size], defaultScale: ref.scale } };
      const b = getBounds(candidate);
      if ((b.minX < cx + 2.1 && b.maxX > cx - 2.1) || (b.minZ < cz + 2.6 && b.maxZ > cz - 2.6) ||
          b.minX < cx - width / 2 + 0.3 || b.maxX > cx + width / 2 - 0.3 || b.minZ < cz - depth / 2 + 0.3 || b.maxZ > cz + depth / 2 - 0.3) continue;
      if ([...mainObjects, ...reservedObjects, ...objects].some(o => {
        const a = getBounds(o);
        return b.minX < a.maxX + 0.2 && b.maxX > a.minX - 0.2 && b.minZ < a.maxZ + 0.2 && b.maxZ > a.minZ - 0.2;
      })) continue;
      if (![-1, 0, 1].every(x => [-1, 0, 1].every(z => {
        const [wx, wz] = worldXZ(candidate, x * size[0] / 2, z * size[2] / 2);
        const support = sampleTerrain(land, wx - cx, wz - cz);
        return support !== null && Math.abs(support - y) <= 0.12;
      }))) continue;
      objects.push(candidate); break;
    }
  }
  return objects;
}

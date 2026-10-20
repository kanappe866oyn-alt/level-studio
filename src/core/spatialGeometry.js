import { getStairLayout } from './assemblySizing.js';
import { CHARACTER_HEIGHT } from './worldScale.js';
import { sampleTerrain, terrainContainsAtHeight } from './terrainSurface.js';
import { riverContains } from './riverSurface.js';
import { scaledBuildingEntry } from './buildingKit.js';
import { isSpatialRailing, railingParts } from './railingParts.js';

export const WALKING = { radius: 0.35, height: CHARACTER_HEIGHT, stepHeight: 0.6, gravity: 30, speed: 5 };
const MARKERS = new Set(['spawn', 'checkpoint', 'goal', 'exit', 'objective', 'room', 'window', 'trap', 'switch', 'key', 'light']);
const SURFACES = new Set(['landform', 'ground', 'platform', 'bridge', 'corridor', 'terrain', 'moving_platform', 'fragile']);
export const DANGEROUS = new Set(['pit', 'hazard', 'water', 'lava']);
const PLAYER_SAMPLES = [[0, 0], ...Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4) * WALKING.radius, Math.sin(i * Math.PI / 4) * WALKING.radius])];
const isFixedStructureMember = o => o.spatialAppearance?.category === 'trim' && ['plaza_cover_', 'plaza_street_', 'path_screen_'].some(prefix => o.spatialAppearance?.moduleId?.startsWith(prefix)) ||
  o.spatialAppearance?.category === 'support' && ['bridge_structure', 'building_canopy'].includes(o.spatialAppearance?.moduleId) ||
  o.spatialAppearance?.category === 'portal' && o.spatialAppearance?.moduleId === 'street_gateway';
// Height grids use immutable height arrays, like terrainMeshData's cache.
// Replacing an edited array refreshes this conservative upper bound.
const gridMaxima = new WeakMap();
export const terrainUpperBound = object => {
  const heights = object.terrainProfile?.surfaceGrid?.heights;
  if (!heights) return object.pos[1] + object.size[1] / 2;
  let max = gridMaxima.get(heights);
  if (max === undefined) { max = heights.reduce((a, b) => Math.max(a, b), -Infinity); gridMaxima.set(heights, max); }
  return object.pos[1] - object.size[1] / 2 + object.size[1] * max;
};

export function localXZ(object, x, z) {
  const angle = object.rot?.[1] || 0;
  const c = Math.cos(angle), s = Math.sin(angle);
  const dx = x - object.pos[0], dz = z - object.pos[2];
  return [c * dx - s * dz, s * dx + c * dz];
}

export function worldXZ(object, x, z) {
  const angle = object.rot?.[1] || 0;
  return [object.pos[0] + Math.cos(angle) * x + Math.sin(angle) * z,
    object.pos[2] - Math.sin(angle) * x + Math.cos(angle) * z];
}

export function isUpright(object) {
  return Math.abs(object.rot?.[0] || 0) < 0.001 && Math.abs(object.rot?.[2] || 0) < 0.001;
}

export function footprintContains(object, x, z, inset = 0) {
  const [lx, lz] = localXZ(object, x, z);
  if (object.role === 'water' && object.riverProfile && !object.customModelUrl) return riverContains(object, lx, lz, inset);
  if (object.role === 'landform' && object.terrainProfile && !object.customModelUrl) {
    if (sampleTerrain(object, lx, lz) === null) return false;
    return !inset || [[inset, 0], [-inset, 0], [0, inset], [0, -inset]].every(([dx, dz]) => sampleTerrain(object, lx + dx, lz + dz) !== null);
  }
  return Math.abs(lx) <= object.size[0] / 2 - inset + 1e-6 && Math.abs(lz) <= object.size[2] / 2 - inset + 1e-6;
}

export function surfaceTop(object, x, z) {
  if (object.role === 'landform' && object.terrainProfile && !object.customModelUrl) {
    const [lx, lz] = localXZ(object, x, z);
    const height = sampleTerrain(object, lx, lz);
    return height === null ? null : object.pos[1] + height;
  }
  return footprintContains(object, x, z) ? object.pos[1] + object.size[1] / 2 : null;
}

// Straight stairs use the exact same step layout as the renderer, ascending local +Z.
export function getCollisionParts(object) {
  if (object.type === 'spline' || MARKERS.has(object.role) || DANGEROUS.has(object.role)) return [];
  if (isSpatialRailing(object)) return railingParts(object.size, object.spatialAppearance.railingAxis).map(part => {
    const [x, z] = worldXZ(object, part.pos[0], part.pos[2]);
    return { ...object, id: `${object.id}_rail_${part.name}`, pos: [x, object.pos[1] + part.pos[1], z], size: part.size, spatialAppearance: undefined };
  });
  if (object.role === 'building' && object.buildingPlacement && !object.customModelUrl) {
    const entry = scaledBuildingEntry(object), bottom = object.pos[1] - object.size[1] / 2;
    const part = (suffix, role, lx, y, lz, size) => {
      const [x, z] = worldXZ(object, lx, lz);
      return { id: `${object.id}_${suffix}`, type: 'box', role, pos: [x, y, z], size, rot: object.rot || [0, 0, 0], variant: 1 };
    };
    const body = part('body', 'wall', 0, object.pos[1], (entry.front - object.size[2] / 2) / 2, [object.size[0], object.size[1], entry.front + object.size[2] / 2]);
    const coverDepth = object.size[2] / 2 - entry.front;
    const cover = part('overhang', 'wall', 0, bottom + (entry.overhangBottom + object.size[1]) / 2, (entry.front + object.size[2] / 2) / 2,
      [object.size[0], object.size[1] - entry.overhangBottom, coverDepth]);
    const rampHeight = Math.max(0.3, entry.ramp.height + 0.1);
    const ramp = part('entry', 'landform', entry.ramp.x, bottom + entry.ramp.height - rampHeight / 2, (entry.ramp.near + entry.ramp.far) / 2,
      [entry.ramp.width, rampHeight, entry.ramp.near - entry.ramp.far]);
    ramp.rot = [object.rot?.[0] || 0, (object.rot?.[1] || 0) + Math.PI, object.rot?.[2] || 0];
    ramp.terrainProfile = { seed: 0, relief: 0, edgeRoughness: 0, grade: entry.ramp.height };
    return [body, cover, ramp];
  }
  if (object.role !== 'climb' || object.variant === 2) return [object];
  const { count, stepHeight, stepDepth } = getStairLayout(object.size);
  return Array.from({ length: count }, (_, i) => {
    const [x, z] = worldXZ(object, 0, -object.size[2] / 2 + stepDepth * (i + 0.5));
    const height = stepHeight * (i + 1);
    return { ...object, pos: [x, object.pos[1] - object.size[1] / 2 + height / 2, z], size: [object.size[0], height, stepDepth] };
  });
}

export function isWalkable(object) {
  return isUpright(object) && (SURFACES.has(object.role) || (object.role === 'climb' && object.variant !== 2));
}

export function getBounds(object) {
  const c = Math.abs(Math.cos(object.rot?.[1] || 0)), s = Math.abs(Math.sin(object.rot?.[1] || 0));
  const shore = object.role === 'landform' && !object.customModelUrl ? object.terrainProfile?.shoreline : null;
  const width = object.size[0] * (1 + (shore ? 2 * Math.max(...shore.sections.map(p => Math.abs(p[1]))) : 0));
  const hx = (width * c + object.size[2] * s) / 2;
  const hz = (width * s + object.size[2] * c) / 2;
  return { minX: object.pos[0] - hx, maxX: object.pos[0] + hx, minZ: object.pos[2] - hz, maxZ: object.pos[2] + hz };
}

// Yaw-aware separating-axis test. Mesh detail and pitched/rolled geometry remain approximate.
export function boxesOverlap(a, b) {
  if (a.pos[1] - a.size[1] / 2 >= b.pos[1] + b.size[1] / 2 - 1e-5 ||
      b.pos[1] - b.size[1] / 2 >= a.pos[1] + a.size[1] / 2 - 1e-5) return false;
  for (const angle of [a.rot?.[1] || 0, b.rot?.[1] || 0]) {
    for (const axis of [[Math.cos(angle), -Math.sin(angle)], [Math.sin(angle), Math.cos(angle)]]) {
      const project = o => {
        const t = o.rot?.[1] || 0;
        return Math.abs(axis[0] * Math.cos(t) - axis[1] * Math.sin(t)) * o.size[0] / 2 +
          Math.abs(axis[0] * Math.sin(t) + axis[1] * Math.cos(t)) * o.size[2] / 2;
      };
      if (Math.abs(axis[0] * (a.pos[0] - b.pos[0]) + axis[1] * (a.pos[2] - b.pos[2])) >= project(a) + project(b) - 1e-5) return false;
    }
  }
  return true;
}

export function createSpatialWorld(objects) {
  const grid = new Map();
  const parts = objects.flatMap(getCollisionParts);
  const hazards = objects.filter(o => DANGEROUS.has(o.role));
  for (const part of parts) {
    const bounds = getBounds(part);
    for (let x = Math.floor(bounds.minX / 4); x <= Math.floor(bounds.maxX / 4); x++) {
      for (let z = Math.floor(bounds.minZ / 4); z <= Math.floor(bounds.maxZ / 4); z++) {
        const key = `${x}:${z}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(part);
      }
    }
  }
  const nearby = (x, z) => {
    const found = new Set();
    for (let gx = Math.floor((x - WALKING.radius) / 4); gx <= Math.floor((x + WALKING.radius) / 4); gx++) {
      for (let gz = Math.floor((z - WALKING.radius) / 4); gz <= Math.floor((z + WALKING.radius) / 4); gz++) {
        for (const part of grid.get(`${gx}:${gz}`) || []) found.add(part);
      }
    }
    return [...found];
  };
  const heights = (x, z) => nearby(x, z).filter(isWalkable).map(o => surfaceTop(o, x, z)).filter(y => y !== null);
  const blockedAt = (neighbours, x, z, footY) => neighbours.some(o => {
    if (o.role === 'landform' && o.terrainProfile && !o.customModelUrl) {
      const bottom = o.pos[1] - o.size[1] / 2;
      if (bottom >= footY + WALKING.height - 1e-5 || terrainUpperBound(o) < footY + WALKING.stepHeight + 1e-5 - 1e-9) return false;
      // Sample the circular player footprint against the same triangulated volume.
      return PLAYER_SAMPLES.some(([dx, dz]) => {
        const top = surfaceTop(o, x + dx, z + dz);
        if (top === null || top <= footY + WALKING.stepHeight + 1e-5 || bottom >= footY + WALKING.height - 1e-5) return false;
        if (!o.terrainProfile.cliffRelief) return true;
        const [lx, lz] = localXZ(o, x + dx, z + dz);
        const y = Math.min(top - 1e-6, footY + WALKING.height - 1e-5) - o.pos[1];
        return terrainContainsAtHeight(o, lx, y, lz);
      });
    }
    const bottom = o.pos[1] - o.size[1] / 2, top = o.pos[1] + o.size[1] / 2;
    if (top <= footY + 1e-5 || bottom >= footY + WALKING.height - 1e-5) return false;
    if (isWalkable(o) && top <= footY + WALKING.stepHeight + 1e-5 && bottom <= footY + 0.05) return false;
    const [lx, lz] = localXZ(o, x, z);
    const dx = Math.max(Math.abs(lx) - o.size[0] / 2, 0);
    const dz = Math.max(Math.abs(lz) - o.size[2] / 2, 0);
    return dx * dx + dz * dz < WALKING.radius * WALKING.radius - 1e-6;
  });
  const blocked = (x, z, footY) => blockedAt(nearby(x, z), x, z, footY);
  const floor = (x, z, footY, maxRise = WALKING.stepHeight) => {
    // Reuse the neighbourhood and test the highest eligible floor first. Once
    // it is clear, lower floors cannot change the original Math.max result.
    const neighbours = nearby(x, z);
    const candidates = neighbours.filter(isWalkable).map(o => surfaceTop(o, x, z))
      .filter(h => h !== null && h <= footY + maxRise + 1e-5).sort((a, b) => b - a);
    let previous;
    for (const h of candidates) {
      if (h === previous) continue;
      previous = h;
      if (!blockedAt(neighbours, x, z, h)) return h;
    }
    return -Infinity;
  };
  const dangerous = (x, z, y) => hazards.some(o => footprintContains(o, x, z) &&
    y <= o.pos[1] + o.size[1] / 2 + 0.15 && y >= o.pos[1] - o.size[1] / 2 - 0.15);
  return { parts, heights, blocked, floor, dangerous };
}

// Select a support near the requested bottom, rather than snapping every item to Y=0.
export function snapToSupports(objects, prefabs) {
  const surfaces = objects.flatMap(getCollisionParts).filter(isWalkable);
  return objects.map(object => {
    // Structural assemblies retain their authored heights near walking tops.
    if (isFixedStructureMember(object)) return object;
    if (object.modelGrounding) {
      const support = surfaces.find(s => s.id === object.modelGrounding.surfaceId);
      const height = support && surfaceTop(support, object.pos[0], object.pos[2]);
      if (height === undefined || height === null) return object;
      return { ...object, pos: [object.pos[0], height - object.modelGrounding.inset + object.size[1] / 2, object.pos[2]] };
    }
    if (!prefabs[object.role]?.groundSnap) return object;
    const bottom = object.pos[1] - object.size[1] / 2;
    const candidates = surfaces.filter(s => s.id !== object.id).map(s => surfaceTop(s, object.pos[0], object.pos[2]))
      .filter(y => y !== null && Math.abs(y - bottom) <= WALKING.stepHeight + 1e-5);
    if (!candidates.length) return object;
    const support = candidates.reduce((best, y) => Math.abs(y - bottom) < Math.abs(best - bottom) ? y : best);
    return { ...object, pos: [object.pos[0], support + object.size[1] / 2, object.pos[2]] };
  });
}

export function regroundTerrainObjects(objects, previous, next, prefabs) {
  return objects.map(object => {
    const attachment = object.modelGrounding;
    if (isFixedStructureMember(object) || object.id === next.id || (attachment ? attachment.surfaceId !== next.id : !prefabs[object.role]?.groundSnap)) return object;
    const before = surfaceTop(previous, object.pos[0], object.pos[2]);
    const after = surfaceTop(next, object.pos[0], object.pos[2]);
    const inset = attachment?.inset || 0;
    if (before === null || after === null || Math.abs(object.pos[1] - object.size[1] / 2 + inset - before) > 0.06) return object;
    return { ...object, pos: [object.pos[0], after - inset + object.size[1] / 2, object.pos[2]] };
  });
}

import { Color } from 'three';
import { getBounds, localXZ, worldXZ } from './spatialGeometry.js';
import { trailDistance, trailPoints } from './natureTrails.js';
import { sectionOffset } from './riverSurface.js';

export const hasNatureAppearance = objects => objects.some(o => o.role === 'landform' && o.terrainProfile?.shoreline && !o.customModelUrl);

export function natureLightingBounds(objects) {
  const bounds = objects.map(getBounds);
  const minX = Math.min(...bounds.map(b => b.minX)), maxX = Math.max(...bounds.map(b => b.maxX));
  const minZ = Math.min(...bounds.map(b => b.minZ)), maxZ = Math.max(...bounds.map(b => b.maxZ));
  const height = Math.max(0, ...objects.map(o => o.pos[1] + o.size[1] / 2));
  const span = Math.max(20, Math.hypot(maxX - minX, maxZ - minZ) + height);
  return { centre: [(minX + maxX) / 2, height / 3, (minZ + maxZ) / 2], radius: span * 0.65, span };
}

// Neutral, tileable detail preserves the chosen palette. No external images are fetched.
function graniteNoise(x, y, resolution, frequency) {
  const px = x / resolution * frequency, py = y / resolution * frequency;
  const ix = Math.floor(px), iy = Math.floor(py), sx = px - ix, sy = py - iy;
  const tx = sx * sx * (3 - 2 * sx), ty = sy * sy * (3 - 2 * sy);
  const hash = (a, b) => ((Math.imul((a + frequency) % frequency + 17, 73856093) ^ Math.imul((b + frequency) % frequency + 29, 19349663)) >>> 0) / 0xffffffff;
  const a = hash(ix, iy) * (1 - tx) + hash(ix + 1, iy) * tx;
  const b = hash(ix, iy + 1) * (1 - tx) + hash(ix + 1, iy + 1) * tx;
  return a * (1 - ty) + b * ty;
}

export function natureTexturePixels(kind, resolution = 128) {
  const data = new Uint8Array(resolution * resolution * 4);
  for (let y = 0; y < resolution; y++) for (let x = 0; x < resolution; x++) {
    const noise = ((Math.imul(x + 11, 73856093) ^ Math.imul(y + 7, 19349663)) >>> 0) % 31;
    let value;
    if (kind === 'grass') value = 240 + noise * 0.5 - 8;
    else if (kind === 'masonry') {
      // 2 m tile: four 0.5 m courses, staggered 1 m blocks, narrow mortar.
      const course = Math.floor(y / (resolution / 4));
      const shifted = x + (course % 2) * resolution / 4;
      const jointX = shifted % (resolution / 2), jointY = y % (resolution / 4);
      const block = Math.floor(shifted / (resolution / 2)) % 2;
      const shade = ((course * 7 + block * 11) % 9) - 4;
      value = jointX < 1 || jointY < 1 ? 132 : 225 + shade + noise * 0.22;
    }
    else if (kind === 'rock') value = 230 + 8 * Math.sin(y / resolution * Math.PI * 12 + Math.sin(x / resolution * Math.PI * 2)) + noise * 0.2;
    else if (kind === 'granite') value = 202 + graniteNoise(x, y, resolution, 5) * 28 + graniteNoise(x, y, resolution, 13) * 14 + noise * 0.3;
    else if (['setts', 'brick-paving', 'slate'].includes(kind)) {
      const [columns, rows] = kind === 'setts' ? [8, 8] : kind === 'brick-paving' ? [6, 12] : [2, 3];
      const row = Math.floor(y / resolution * rows);
      const shifted = x / resolution * columns + (kind !== 'slate' && row % 2 ? 0.5 : 0);
      const col = Math.floor(shifted) % columns, u = shifted - Math.floor(shifted), v = y / resolution * rows - row;
      const joint = kind === 'slate' ? u < 0.02 || v < 0.03 : u < 0.065 || v < 0.065;
      const shade = ((row * 13 + col * 7) % 5) * (kind === 'slate' ? 2 : 3);
      value = joint ? 150 : 220 + shade + noise * 0.2;
    }
    else if (kind === 'paving') {
      const row = Math.floor(y / (resolution / 4));
      const jointX = (x + (row % 2) * resolution / 4) % (resolution / 2);
      const jointY = y % (resolution / 4);
      value = jointX < 2 || jointY < 2 ? 150 : 218 + noise * 0.25;
    } else if (kind === 'wood') {
      const joint = x % (resolution / 4) < 2;
      const grain = Math.sin(x / resolution * Math.PI * 20 + 0.5 * Math.sin(y / resolution * Math.PI * 2));
      value = joint ? 145 : 218 + grain * 9 + noise * 0.2;
    } else if (kind === 'water') value = 215 + 16 * Math.sin((x + y * 2) / resolution * Math.PI * 8);
    else throw new Error('自然素材の種類が不正です。');
    const i = (y * resolution + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = Math.round(value); data[i + 3] = 255;
  }
  return data;
}

// Tangent-space normal maps export to GLB; they never displace the walking surface.
export function natureNormalPixels(kind, resolution = 128) {
  const source = natureTexturePixels(kind, resolution), data = new Uint8Array(source.length);
  const height = (x, y) => source[(((y + resolution) % resolution) * resolution + (x + resolution) % resolution) * 4] / 255;
  const strength = { setts: 0.9, 'brick-paving': 0.65, slate: 0.55, masonry: 1.1, grass: 0.45, rock: 1.5, granite: 0.6, paving: 0.65, wood: 0.55, water: 0.8 }[kind];
  for (let y = 0; y < resolution; y++) for (let x = 0; x < resolution; x++) {
    const nx = (height(x - 1, y) - height(x + 1, y)) * strength;
    const ny = (height(x, y - 1) - height(x, y + 1)) * strength;
    const length = Math.hypot(nx, ny, 1), i = (y * resolution + x) * 4;
    data[i] = Math.round((nx / length * 0.5 + 0.5) * 255);
    data[i + 1] = Math.round((ny / length * 0.5 + 0.5) * 255);
    data[i + 2] = Math.round((1 / length * 0.5 + 0.5) * 255); data[i + 3] = 255;
  }
  return data;
}

// UVs are measured in metres so resizing changes repeat count, not detail scale.
export function planarUVs(positions, scale = 3) {
  const uv = [];
  for (let i = 0; i < positions.length; i += 3) uv.push(positions[i] / scale, positions[i + 2] / scale);
  return uv;
}

export function boxSurfaceUVs(positions, normals, scale = 1.6) {
  const uv = [];
  for (let i = 0; i < positions.length; i += 3) {
    if (Math.abs(normals[i + 1]) > 0.5) uv.push(positions[i] / scale, positions[i + 2] / scale);
    else uv.push((Math.abs(normals[i]) > 0.5 ? positions[i + 2] : positions[i]) / scale, positions[i + 1] / scale);
  }
  return uv;
}

export function terrainSurfaceUVs(data, object) {
  const sideScale = object?.terrainProfile?.sideMaterial === 'masonry' ? 2 : 3;
  const uv = planarUVs(data.positions);
  if (object?.terrainProfile?.surfaceMapping === 'world') {
    for (let k = 0; k < data.positions.length / 3; k++) {
      const [x, z] = worldXZ(object, data.positions[k * 3], data.positions[k * 3 + 2]);
      uv[k * 2] = x / 3; uv[k * 2 + 1] = z / 3;
    }
    // Stair risers have duplicated vertices. Project those vertical faces
    // independently so a planar floor mapping cannot collapse their texture.
    if (object.terrainProfile.stepCount) for (const triangle of data.triangles) {
      const p = triangle.map(k => {
        const [x, z] = worldXZ(object, data.positions[k * 3], data.positions[k * 3 + 2]);
        return [x, data.positions[k * 3 + 1] + object.pos[1], z];
      });
      const a = p[1].map((v, i) => v - p[0][i]), b = p[2].map((v, i) => v - p[0][i]);
      if (Math.abs(a[0] * b[2] - a[2] * b[0]) > 1e-9) continue;
      const nx = a[1] * b[2] - a[2] * b[1], nz = a[0] * b[1] - a[1] * b[0];
      triangle.forEach((k, i) => { uv[k * 2] = p[i][Math.abs(nx) > Math.abs(nz) ? 2 : 0] / 3; uv[k * 2 + 1] = p[i][1] / 3; });
    }
  }
  // Side quads are duplicated by terrainMeshData, giving hard normals and independent UVs.
  for (const { start: k, distance, segment, coordinates } of data.sideQuads) {
    const p = data.positions;
    for (let j = 0; j < (coordinates?.length || 4); j++) {
      uv[(k + j) * 2] = (distance + (coordinates ? coordinates[j][0] * segment : j % 2 ? segment : 0)) / sideScale;
      uv[(k + j) * 2 + 1] = p[(k + j) * 3 + 1] / sideScale;
    }
  }
  return uv;
}

// Coping and stone face share the terrain mesh, including its existing recesses.
// Duplicated side vertices keep the cap colour from bleeding into the wall.
export function terrainMasonryColors(data, object) {
  const top = new Color(object.color || '#c0b59b');
  const face = new Color(object.color2 || '#8b918b');
  const cap = top.clone().lerp(new Color('#d0cec0'), 0.45);
  const colors = Array.from({ length: data.positions.length / 3 }, () => top.toArray()).flat();
  for (const { start, finishBand, coordinates } of data.sideQuads) {
    const color = finishBand === 'cap' ? cap : face;
    for (let j = 0; j < (coordinates?.length || 4); j++) colors.splice((start + j) * 3, 3, color.r, color.g, color.b);
  }
  return colors;
}

// Bake worn paths into vertex colours: no extra floor, height or collision volume.
export function terrainSurfaceColors(data, object, bridges = []) {
  if (object.terrainProfile?.surfaceBlend === 'slope') return terrainLandscapeColors(data, object);
  const topCount = Math.max(...data.indices.slice(0, data.topIndexCount)) + 1;
  const grass = new Color(object.color || '#6f9167'), rock = new Color(object.color2 || '#74797e');
  const soil = grass.clone().lerp(new Color('#aa9270'), 0.7);
  const shore = object.terrainProfile?.shoreline, top = object.pos[1] + object.size[1] / 2;
  const landBounds = getBounds(object);
  const trail = trailPoints(object);
  const n = Math.round(object.size[0] / data.cellX), row = n + 1;
  const perimeter = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    if (i === 0 || i === n || j === 0 || j === n) perimeter.push(j * row + i);
  }
  // Measure the real, deformed boundary rather than the terrace's enclosing rectangle.
  const boundarySegments = [];
  for (const k of perimeter) {
    const i = k % row, j = Math.floor(k / row);
    for (const next of [i < n && (j === 0 || j === n) ? k + 1 : null, j < n && (i === 0 || i === n) ? k + row : null]) {
      if (next !== null) boundarySegments.push([[data.positions[k * 3], data.positions[k * 3 + 2]], [data.positions[next * 3], data.positions[next * 3 + 2]]]);
    }
  }
  const crossings = shore ? bridges.filter(b => {
    const bounds = getBounds(b);
    return Math.abs(b.pos[1] + b.size[1] / 2 - top) < 0.2 && bounds.maxX >= landBounds.minX - 0.3 && bounds.minX <= landBounds.maxX + 0.3 &&
      Math.abs(localXZ(object, b.pos[0], b.pos[2])[1]) < object.size[2] / 2;
  }).map(b => localXZ(object, b.pos[0], b.pos[2])[1]) : [];
  const colors = [];
  for (let i = 0; i < data.positions.length / 3; i++) {
    const x = data.positions[i * 3], z = data.positions[i * 3 + 2];
    const main = shore ? Math.exp(-Math.pow(x / 1.15, 2)) : 0;
    const crossing = shore && shore.side * x >= 0 ? Math.max(0, ...crossings.map(cz => Math.exp(-Math.pow((z - cz) / 1.1, 2)))) : 0;
    const detour = trail.length ? Math.exp(-Math.pow(trailDistance(trail, x, z) / (object.terrainProfile.trail.width / 2), 2)) : 0;
    const path = Math.max(main, crossing, detour);
    let color;
    if (i < topCount) {
      const edge = shore ? Math.min(...boundarySegments.map(points => trailDistance(points, x, z))) : Infinity;
      const variation = 0.8 + 0.2 * Math.sin(z * 0.9 + x * 0.6 + object.terrainProfile.seed);
      const rim = Math.exp(-Math.pow(edge / 0.85, 2)) * 0.68 * variation;
      color = grass.clone().lerp(rock, rim).lerp(soil, path);
    } else {
      const y = data.positions[i * 3 + 1], worldY = y + object.pos[1];
      const shade = 0.94 + 0.06 * Math.sin(x * 0.8 + z * 0.65 + object.terrainProfile.seed);
      const damp = shore ? Math.max(0, Math.min(1, (0.4 - worldY) / 1.8)) : 0;
      const upperRim = shore ? Math.max(0, 1 - (object.size[1] / 2 - y) / 0.3) : 0;
      color = rock.clone().lerp(grass, upperRim * 0.12).multiplyScalar(shade * (1 - damp * 0.25));
    }
    colors.push(color.r, color.g, color.b);
  }
  return colors;
}

// Area-weighted normals come from the rendered triangles, so rectangular grids,
// deformed edges and nonuniform spacing receive the same finish in every view.
export function terrainLandscapeColors(data, object) {
  const count = data.positions.length / 3, normals = new Float64Array(count * 3);
  const neighbours = new Map();
  for (const [a, b, c] of data.triangles) {
    const p = data.positions, ax = p[b * 3] - p[a * 3], ay = p[b * 3 + 1] - p[a * 3 + 1], az = p[b * 3 + 2] - p[a * 3 + 2];
    const bx = p[c * 3] - p[a * 3], by = p[c * 3 + 1] - p[a * 3 + 1], bz = p[c * 3 + 2] - p[a * 3 + 2];
    const n = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
    for (const k of [a, b, c]) {
      for (let j = 0; j < 3; j++) normals[k * 3 + j] += n[j];
      if (!neighbours.has(k)) neighbours.set(k, new Set());
      for (const other of [a, b, c]) if (other !== k) neighbours.get(k).add(other);
    }
  }
  const grass = new Color(object.color || '#668363'), rock = new Color(object.color2 || '#82786b');
  const earth = new Color('#998569'), damp = new Color('#655e4e');
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const colors = [], seed = object.terrainProfile.seed * 0.017;
  for (let k = 0; k < count; k++) {
    const x = data.positions[k * 3], y = data.positions[k * 3 + 1], z = data.positions[k * 3 + 2];
    const [wx, wz] = worldXZ(object, x, z);
    let color;
    if (neighbours.has(k)) {
      const slope = Math.hypot(normals[k * 3], normals[k * 3 + 2]) / Math.max(1e-8, Math.abs(normals[k * 3 + 1]));
      let hollow = 0;
      for (const j of neighbours.get(k)) hollow += (data.positions[j * 3 + 1] - y) / Math.max(0.01, Math.hypot(data.positions[j * 3] - x, data.positions[j * 3 + 2] - z));
      hollow /= neighbours.get(k).size;
      const patches = (Math.sin(wx * 0.18 + seed) * Math.cos(wz * 0.16 - seed) + 1) / 2;
      color = grass.clone().lerp(earth, patches * 0.2).lerp(rock, smooth(0.22, 0.8, slope) * 0.85)
        .lerp(earth, smooth(0.025, 0.15, hollow) * 0.58).lerp(damp, smooth(0.08, 0.22, hollow) * 0.23);
      color.multiplyScalar(0.93 + patches * 0.1);
      const pathWeight=object.terrainProfile.surfaceGrid?.pathWeights?.[k] || 0;
      color.lerp(new Color('#b6a080'),pathWeight*.88);
    } else {
      // The outer wall is a cut through the ground: a band of soil under the turf, stone below it. Lifted a little, as
      // the wall faces sideways and is always in shade.
      const t = (y + object.size[1] / 2) / object.size[1];
      color = rock.clone().lerp(new Color('#9a948a'), 0.35).lerp(new Color('#7a5a3c'), smooth(0.55, 0.85, t))
        .multiplyScalar(1.12 + 0.08 * Math.sin(wx * 0.2 + wz * 0.13 + seed) ** 2);
    }
    colors.push(color.r, color.g, color.b);
  }
  return colors;
}

export function riverSurfaceColors(data, object) {
  const topCount = Math.max(...data.indices.slice(0, data.topIndexCount)) + 1;
  const water = new Color(object.color || '#4c9da9'), foam = new Color('#d9eae3');
  const half = object.size[0] * object.riverProfile.widthRatio / 2;
  const colors = [];
  for (let i = 0; i < data.positions.length / 3; i++) {
    const x = data.positions[i * 3], z = data.positions[i * 3 + 2];
    const centre = sectionOffset(object.riverProfile.sections, z / object.size[2]) * object.size[0];
    const edgeDistance = Math.max(0, half - Math.abs(x - centre));
    const band = Math.min(0.5, half * 0.2);
    const brightness = (0.58 + 0.12 * Math.sin(z * 1.7 + centre)) * Math.max(0, 1 - edgeDistance / band);
    const color = i < topCount ? water.clone().lerp(foam, brightness) : water.clone().multiplyScalar(0.8);
    colors.push(color.r, color.g, color.b);
  }
  return colors;
}

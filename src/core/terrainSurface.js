// One deterministic triangulated surface is shared by rendering, grounding and walking.
// Coordinates are local to the object. A shoreline can extend up to 9% beyond its base width.
import { validateSections, sectionOffset } from './riverSurface.js';
import { trailPoints, trailDistance } from './natureTrails.js';
import { CURVE_STEPS, curveOffset, fittedCurve, curvedStairRows, connectionWidth } from './terrainCurve.js';
const cache = new WeakMap();
function sameShore(a, b) {
  if (!a || !b) return a === b;
  return a.side === b.side && a.sections?.length === b.sections?.length &&
    a.sections.every((p, i) => p[0] === b.sections[i][0] && p[1] === b.sections[i][1]);
}
function sameTrail(a, b) {
  return (!a || !b) ? a === b : a.width === b.width && a.points.length === b.points.length &&
    a.points.every((p, i) => p[0] === b.points[i][0] && p[1] === b.points[i][1]);
}
export function validateTerrainProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error('地形の設定が不正です。');
  if (profile.rockStrata !== undefined && (profile.rockStrata !== true || !profile.rockMass)) throw new Error('岩の面と割れ目は岩山に指定してください。');
  if (profile.rockMass !== undefined && (profile.rockMass !== true || !profile.surfaceGrid || profile.surfaceMaterial !== 'rock' || profile.sideMaterial !== 'rock' || profile.curve || profile.cornerCut || profile.widthScale || profile.shoreline || profile.trail)) throw new Error('岩山の輪郭には岩素材の高さ格子が必要です。');
  if (!Number.isInteger(profile.seed) || profile.seed < 0 || profile.seed > 65535) throw new Error('地形seedは0〜65535の整数が必要です。');
  if (!Number.isFinite(profile.relief) || profile.relief < 0 || profile.relief > 1.2) throw new Error('地形の起伏は0〜1.2mで指定してください。');
  if (!Number.isFinite(profile.edgeRoughness) || profile.edgeRoughness < 0 || profile.edgeRoughness > 0.12) throw new Error('崖の輪郭変化は0〜0.12で指定してください。');
  if (profile.grade !== undefined && (!Number.isFinite(profile.grade) || profile.grade < 0 || profile.grade > 8)) throw new Error('坂の高低差は0〜8mで指定してください。');
  if (profile.outerInset !== undefined && (!Number.isFinite(profile.outerInset) || profile.outerInset < 0 || profile.outerInset > 0.24)) throw new Error('外縁の絞り込みは0〜0.24で指定してください。');
  if (profile.cliffRelief !== undefined && (!Number.isFinite(profile.cliffRelief) || profile.cliffRelief < 0 || profile.cliffRelief > 0.45)) throw new Error('崖面の凹凸は0〜0.45mで指定してください。');
  if (profile.sideMaterial !== undefined && !['rock', 'masonry'].includes(profile.sideMaterial)) throw new Error('地形の側面素材が不正です。');
  if (profile.surfaceMapping !== undefined && profile.surfaceMapping !== 'world') throw new Error('地形の模様の配置設定が不正です。');
  if (profile.surfaceBlend !== undefined && (profile.surfaceBlend !== 'slope' || !profile.surfaceGrid || profile.surfaceMaterial !== 'grass')) throw new Error('斜面の色分けは草の高さ格子で指定してください。');
  if (profile.portalWidth !== undefined && (!Number.isFinite(profile.portalWidth) || profile.portalWidth < 3 || profile.portalWidth > 12 || profile.curve || profile.grade || profile.surfaceGrid || profile.shoreline || profile.trail || profile.widthScale || profile.outerInset)) throw new Error('広場の接続口の平坦幅は3〜12mで指定し、坂・曲線・高さ格子などと併用しないでください。');
  if (profile.surfaceMaterial !== undefined && !['grass', 'paving', 'rock', 'setts', 'brick-paving', 'slate'].includes(profile.surfaceMaterial)) throw new Error('地形の表面素材が不正です。');
  if (profile.curve !== undefined && (!profile.curve || !Number.isFinite(profile.curve.offset) || Math.abs(profile.curve.offset) > 6 || !Number.isFinite(profile.curve.width) || profile.curve.width < 3 || profile.curve.width > 5)) throw new Error('曲がる道は幅3〜5m、横への変位6m以内で指定してください。');
  if (profile.curve?.flare !== undefined && (!Number.isFinite(profile.curve.flare) || profile.curve.flare < 0 || profile.curve.flare > 1)) throw new Error('道の入口の広がりは片側0〜1mで指定してください。');
  if (profile.curve && (profile.cornerCut || profile.widthScale || profile.surfaceGrid || profile.shoreline || profile.trail)) throw new Error('曲がる道は角・幅変更・高さ格子・岸辺・散策路と併用できません。');
  if (profile.stepCount !== undefined && (!Number.isInteger(profile.stepCount) || profile.stepCount < 2 || profile.stepCount > 64 || !profile.curve || !(profile.grade > 0) || profile.relief !== 0 || profile.edgeRoughness !== 0 || profile.cliffRelief || profile.outerInset)) throw new Error('曲がる階段は2〜64段、曲線と正の高低差を指定し、起伏や輪郭変形を併用しないでください。');
  if (profile.cornerCut !== undefined && (!Number.isFinite(profile.cornerCut) || profile.cornerCut < 0 || profile.cornerCut > 2)) throw new Error('地形の角の切り落としは0〜2mで指定してください。');
  if (profile.widthScale !== undefined && (!Array.isArray(profile.widthScale) || profile.widthScale.length !== 2 || !profile.widthScale.every(v => Number.isFinite(v) && v >= 0.25 && v <= 1))) throw new Error('道の両端の幅比率は0.25〜1の2値で指定してください。');
  if ((profile.cornerCut || profile.widthScale) && (profile.surfaceGrid || profile.shoreline || profile.trail)) throw new Error('角・幅の変更は高さ格子・岸辺・散策路と併用できません。');
  let shoreline;
  let trail;
  let surfaceGrid;
  if (profile.surfaceGrid !== undefined) {
    const g = profile.surfaceGrid;
    if (!g || !Number.isInteger(g.columns) || !Number.isInteger(g.rows) || g.columns < 2 || g.rows < 2 || g.columns > 129 || g.rows > 129 || !Array.isArray(g.heights) || g.heights.length !== g.columns * g.rows || !g.heights.every(h => Number.isFinite(h) && h >= 0.01 && h <= 1)) throw new Error('地形の高さ格子は2〜129列・行、厚みの比率0.01〜1で指定してください。');
    surfaceGrid = { columns: g.columns, rows: g.rows, heights: [...g.heights] };
    if(g.pathWeights!==undefined){
      if(!Array.isArray(g.pathWeights)||g.pathWeights.length!==g.heights.length||!g.pathWeights.every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw new Error('地形の道の色分けは高さ格子と同じ個数の0〜1の値が必要です。');
      surfaceGrid.pathWeights=[...g.pathWeights];
    }
  }
  if (profile.trail !== undefined) {
    const value = profile.trail;
    if (!value || !Number.isFinite(value.width) || value.width < 0.8 || value.width > 3 ||
        !Array.isArray(value.points) || value.points.length < 2 || value.points.length > 32 ||
        !value.points.every(p => Array.isArray(p) && p.length === 2 && p.every(v => Number.isFinite(v) && Math.abs(v) <= 0.45))) {
      throw new Error('散策路は幅0.8〜3m、地形内の座標2〜32点で指定してください。');
    }
    trail = { width: value.width, points: value.points.map(p => [...p]) };
  }
  if (profile.shoreline !== undefined) {
    if (![1, -1].includes(profile.shoreline?.side)) throw new Error('岸の向きは-1または1が必要です。');
    const sections = validateSections(profile.shoreline.sections);
    if (sections.length !== 13 || sections.some((p, i) => Math.abs(p[0] - (i / 12 - 0.5)) > 1e-7 || Math.abs(p[1]) > 0.09 + 1e-7)) throw new Error('岸辺は13点、変形幅は地形幅の9%以内で指定してください。');
    shoreline = { side: profile.shoreline.side, sections };
  }
  return { seed: profile.seed, ...(profile.rockStrata ? { rockStrata: true } : {}), ...(profile.rockMass ? { rockMass: true } : {}), ...(profile.portalWidth !== undefined ? { portalWidth: profile.portalWidth } : {}), relief: profile.relief, edgeRoughness: profile.edgeRoughness, ...(profile.sideMaterial ? { sideMaterial: profile.sideMaterial } : {}), ...(profile.surfaceMaterial ? { surfaceMaterial: profile.surfaceMaterial } : {}), ...(profile.surfaceBlend ? { surfaceBlend: profile.surfaceBlend } : {}), ...(profile.surfaceMapping ? { surfaceMapping: profile.surfaceMapping } : {}), ...(profile.curve ? { curve: { offset: profile.curve.offset, width: profile.curve.width, ...(profile.curve.flare !== undefined ? { flare: profile.curve.flare } : {}) } } : {}), ...(profile.stepCount !== undefined ? { stepCount: profile.stepCount } : {}), ...(profile.cornerCut !== undefined ? { cornerCut: profile.cornerCut } : {}), ...(profile.widthScale ? { widthScale: [...profile.widthScale] } : {}), ...(surfaceGrid ? { surfaceGrid } : {}), ...(profile.grade !== undefined ? { grade: profile.grade } : {}), ...(profile.cliffRelief !== undefined ? { cliffRelief: profile.cliffRelief } : {}), ...(profile.outerInset !== undefined ? { outerInset: profile.outerInset } : {}), ...(shoreline ? { shoreline } : {}), ...(trail ? { trail } : {}) };
}

export function terrainMeshData(object) {
  let saved = cache.get(object);
  const current = object.terrainProfile;
  if (saved && (saved.curve?.offset !== current?.curve?.offset || saved.curve?.width !== current?.curve?.width || saved.curve?.flare !== current?.curve?.flare)) saved = undefined;
  if (saved && saved.stepCount !== current?.stepCount) saved = undefined;
  if (saved && saved.portalWidth !== current?.portalWidth) saved = undefined;
  // Generated grids are immutable arrays. Replacing a grid or its array invalidates
  // the cache without scanning thousands of heights on every walking sample.
  if (saved && saved.rockMass !== current?.rockMass) saved = undefined;
  if (saved && saved.rockStrata !== current?.rockStrata) saved = undefined;
  if (saved && (saved.gridSource !== current?.surfaceGrid || saved.gridHeights !== current?.surfaceGrid?.heights || saved.surfaceGrid?.columns !== current?.surfaceGrid?.columns || saved.surfaceGrid?.rows !== current?.surfaceGrid?.rows)) saved = undefined;
  if (saved && saved.width === object.size[0] && saved.height === object.size[1] && saved.depth === object.size[2] && saved.seed === current?.seed && saved.grade === current?.grade && saved.relief === current?.relief && saved.edgeRoughness === current?.edgeRoughness && saved.sideMaterial === current?.sideMaterial && saved.cliffRelief === current?.cliffRelief && saved.cornerCut === current?.cornerCut && saved.widthScale?.[0] === current?.widthScale?.[0] && saved.widthScale?.[1] === current?.widthScale?.[1] && saved.outerInset === current?.outerInset && sameShore(saved.shoreline, current?.shoreline) && sameTrail(saved.trail, current?.trail)) return saved.data;
  const profile = validateTerrainProfile(object.terrainProfile);
  const [width, height, depth] = object.size;
  // Numeric edits may temporarily shrink the volume below its saved rise.
  // Keep the live mesh finite; saved-project validation rejects that invalid state.
  const grade = Math.min(profile.grade || 0, Math.max(0, height - 0.01));
  const curve = profile.curve && fittedCurve(width, profile.curve);
  const n = profile.trail || profile.curve ? CURVE_STEPS : 12;
  const cut = Math.min(profile.cornerCut || 0, Math.max(0, width / 2 - 2.5), Math.max(0, depth / 2 - 2.5));
  const zRows = Array.from({ length: n + 1 }, (_, j) => (j / n - 0.5) * depth);
  if (cut) zRows.push(-depth / 2 + cut, depth / 2 - cut);
  const stairRows = profile.stepCount ? curvedStairRows(profile.stepCount) : null;
  const orderedZ = stairRows ? stairRows.map(p => (p.t - 0.5) * depth) : zRows.sort((a, b) => a - b).filter((z, i, all) => !i || z - all[i - 1] > 1e-8);
  const nx = profile.surfaceGrid ? profile.surfaceGrid.columns - 1 : n, nz = profile.surfaceGrid ? profile.surfaceGrid.rows - 1 : orderedZ.length - 1, row = nx + 1;
  const trail = trailPoints(object);
  const positions = [], indices = [], triangles = [], bins = new Map();
  const phase = profile.seed * 0.017;
  const amplitude = Math.min(profile.relief, height * 0.12);
  const taper = (value, reserve, extent) => Math.max(0, Math.min(1, (Math.abs(value) - reserve) / Math.max(0.1, extent - reserve)));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x0 = (i / nx - 0.5) * width, z0 = profile.surfaceGrid ? (j / nz - 0.5) * depth : orderedZ[j];
    const along = z0 / depth + 0.5;
    // Preserve the stair approaches (X=0) and bridge landings (Z=0).
    const tx = taper(x0, 2, width / 2), tz = taper(z0, 2.5, depth / 2);
    const shoreWeight = profile.shoreline ? Math.max(0, (profile.shoreline.side * x0 / (width / 2) - 0.5) * 2) : 0;
    const outerSide = profile.shoreline ? -profile.shoreline.side : Math.sign(x0);
    const outerWeight = outerSide * x0 > 0 ? 1 : 0;
    // Linear taper keeps grid rows ordered, including very narrow manually resized terrain.
    const maxCut = Math.min(width, Math.max(0, width / 2 - 2) * 3);
    const outerCut = (profile.outerInset || 0) * maxCut * outerWeight * tx * tz *
      (0.65 + 0.35 * Math.sin(z0 / depth * Math.PI * 2 + phase));
    let x = x0 * (1 - profile.edgeRoughness * tz * (1 - shoreWeight) * (0.7 + 0.3 * Math.sin(z0 * 0.65 + phase))) +
      (profile.shoreline ? sectionOffset(profile.shoreline.sections, j / nz - 0.5) * width * shoreWeight : 0) - outerSide * outerCut;
    let z = z0 * (1 - profile.edgeRoughness * tx * (1 - shoreWeight) * (0.7 + 0.3 * Math.cos(x0 * 0.6 - phase)));
    if (profile.surfaceGrid) {
      // Only the outer fringe bends. Interior grid vertices reserved for routes
      // keep their exact coordinates, independently of the overall map size.
      const fringe = Math.min(4, width * 0.1, depth * 0.1);
      const amount = Math.min(fringe * 0.72, profile.edgeRoughness * 24);
      const edge = (v, extent) => Math.max(0, (Math.abs(v) - extent / 2 + fringe) / fringe);
      x = x0 - Math.sign(x0) * amount * edge(x0, width) * (0.7 + 0.3 * Math.sin(z0 * 0.23 + phase));
      z = z0 - Math.sign(z0) * amount * edge(z0, depth) * (0.7 + 0.3 * Math.cos(x0 * 0.21 - phase));
    }
    if (cut) x -= Math.sign(x0) * Math.max(0, Math.abs(z0) - depth / 2 + cut) * taper(x0, 2, width / 2);
    if (profile.widthScale) x *= profile.widthScale[0] * (1 - along) + profile.widthScale[1] * along;
    if (curve) x = x0 * connectionWidth(curve.width, curve.flare, along) / width + curveOffset(curve.offset, along);
    if (profile.rockMass) {
      // A square-to-disc map keeps the filled grid ordered while rounding its
      // perimeter. The same triangles remain authoritative for walking/export.
      x = x0 * Math.sqrt(1 - 0.5 * (z0 / (depth / 2)) ** 2);
      z = z0 * Math.sqrt(1 - 0.5 * (x0 / (width / 2)) ** 2);
    }
    const trailTaper = profile.trail ? Math.max(0, Math.min(1, (trailDistance(trail, x, z) - profile.trail.width / 2 - 0.5) / 1.2)) : 1;
    // Reserve the actual, deformed portal width, including neighbouring mesh
    // vertices. Otherwise interpolation can leave a lip at a flared entrance.
    const depressionX = profile.portalWidth ? taper(x, profile.portalWidth / 2, width / 2) : tx;
    const depressionZ = profile.portalWidth ? taper(z, profile.portalWidth / 2, depth / 2) : tz;
    const depression = amplitude * depressionX * depressionZ * trailTaper * (0.5 + 0.25 * Math.sin(x * 0.42 + phase) + 0.25 * Math.cos(z * 0.48 - phase));
    positions.push(x, profile.surfaceGrid ? -height / 2 + height * profile.surfaceGrid.heights[j * row + i] : height / 2 - grade * (1 - (stairRows ? stairRows[j].height : along)) - depression, z);
  }
  const addTriangle = (a, b, c) => {
    // Risers need separate vertices so averaged normals cannot round the tread edge.
    if (stairRows && Math.abs(positions[a * 3 + 2] - positions[b * 3 + 2]) < 1e-10 && Math.abs(positions[a * 3 + 2] - positions[c * 3 + 2]) < 1e-10) {
      [a, b, c] = [a, b, c].map(k => {
        const index = positions.length / 3;
        positions.push(...positions.slice(k * 3, k * 3 + 3));
        return index;
      });
    }
    indices.push(a, b, c);
    const triangle = [a, b, c]; triangles.push(triangle);
    const xs = triangle.map(k => positions[k * 3]), zs = triangle.map(k => positions[k * 3 + 2]);
    for (let x = Math.floor(Math.min(...xs) / (width / nx)); x <= Math.floor(Math.max(...xs) / (width / nx)); x++) {
      for (let z = Math.floor(Math.min(...zs) / (depth / nz)); z <= Math.floor(Math.max(...zs) / (depth / nz)); z++) {
        const key = `${x}:${z}`; if (!bins.has(key)) bins.set(key, []); bins.get(key).push(triangle);
      }
    }
  };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * row + i, b = a + 1, d = a + row, c = d + 1;
    addTriangle(a, d, c); addTriangle(a, c, b);
  }
  const topIndexCount = indices.length;
  const perimeter = [];
  for (let i = 0; i <= nx; i++) perimeter.push(i);
  for (let j = 1; j <= nz; j++) perimeter.push(j * row + nx);
  for (let i = nx - 1; i >= 0; i--) perimeter.push(nz * row + i);
  for (let j = nz - 1; j >= 1; j--) perimeter.push(j * row);
  const bottomCentre = positions.length / 3;
  if (profile.curve) {
    // A bowed strip is concave: a fan from the box centre would fill the void
    // underneath the bend. Mirror the top tessellation for the underside.
    for (let i = 0; i < bottomCentre; i++) positions.push(positions[i * 3], -height / 2, positions[i * 3 + 2]);
    for (const [a, b, c] of triangles) indices.push(bottomCentre + a, bottomCentre + c, bottomCentre + b);
  } else positions.push(0, -height / 2, 0);
  const sideQuads = [], wallTriangles = [];
  const layers = profile.cliffRelief ? [[0, 0], [0.32, 0.12], [0.62, 0.88], [1, 1]] : [[0, 0], [1, 0]];
  // Split a coplanar band for the coping. Interpolate existing cliff layers so
  // this finish does not move the wall, close a passage or change a sight line.
  const capT = profile.sideMaterial === 'masonry' ? Math.min(0.2, 0.18 / height) : 0;
  const wallPoint = (vertex, [t, amount]) => {
    const x = positions[vertex * 3], y = positions[vertex * 3 + 1], z = positions[vertex * 3 + 2];
    // Recess the lower wall inside the original footprint; keep the upper walking surface intact.
    // Connection axes remain vertical, so stairs and bridge abutments retain their support.
    const clearance = Math.min(Math.max(0, Math.abs(x) - 2), Math.max(0, Math.abs(z) - 2.5), 1);
    const inset = Math.min(profile.cliffRelief || 0, width * 0.025, depth * 0.025) * clearance * amount *
      (0.65 + 0.35 * Math.sin(x * 0.7 + z * 0.6 + phase) ** 2);
    const scale = 1 - inset / Math.max(0.1, Math.hypot(x, z));
    return [x * scale, y + (-height / 2 - y) * t, z * scale];
  };
  let distance = 0;
  for (let i = 0; i < perimeter.length; i++) {
    const a = perimeter[i], b = perimeter[(i + 1) % perimeter.length];
    const ax = positions[a * 3], az = positions[a * 3 + 2], bx = positions[b * 3], bz = positions[b * 3 + 2];
    const segment = Math.hypot(bx - ax, bz - az);
    for (let layer = 0; layer < layers.length - 1; layer++) {
      const points = [wallPoint(a, layers[layer]), wallPoint(b, layers[layer]), wallPoint(a, layers[layer + 1]), wallPoint(b, layers[layer + 1])];
      const emitFace = (vertices, finishBand) => {
        const k = positions.length / 3;
        for (const v of vertices) positions.push(...v.p);
        for (let j = 1; j < vertices.length - 1; j++) {
          indices.push(k, k + j, k + j + 1);
          wallTriangles.push([k, k + j, k + j + 1]);
        }
        sideQuads.push({ start: k, distance, segment, finishBand, coordinates: vertices.map(v => [v.u, v.p[1]]) });
      };
      if (capT && layer === 0) {
        // Clip each original triangle, not the non-planar quad. Interpolated
        // points stay on its plane, preserving the exact old collision volume.
        const ratio = capT / layers[1][0];
        const source = points.map((p, j) => ({ p, u: j % 2, v: j < 2 ? 0 : 1 }));
        const clip = (polygon, upper) => {
          const out = [];
          for (let j = 0; j < polygon.length; j++) {
            const a = polygon[j], b = polygon[(j + 1) % polygon.length];
            const inA = upper ? a.v <= ratio : a.v >= ratio, inB = upper ? b.v <= ratio : b.v >= ratio;
            if (inA) out.push(a);
            if (inA !== inB) {
              const t = (ratio - a.v) / (b.v - a.v);
              out.push({ p: a.p.map((p, k) => p + (b.p[k] - p) * t), u: a.u + (b.u - a.u) * t, v: ratio });
            }
          }
          return out;
        };
        for (const triangle of [[0, 1, 2], [1, 3, 2]]) {
          const vertices = triangle.map(j => source[j]);
          emitFace(clip(vertices, true), 'cap');
          emitFace(clip(vertices, false), 'face');
        }
      } else {
        const k = positions.length / 3;
        positions.push(...points.flat());
        indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        wallTriangles.push([k, k + 1, k + 2], [k + 1, k + 3, k + 2]);
        sideQuads.push({ start: k, distance, segment, ...(capT ? { finishBand: 'face' } : {}) });
        if (!profile.curve && layer === layers.length - 2) indices.push(bottomCentre, k + 2, k + 3);
      }
      // A single-layer wall needs its original underside as well.
      if (capT && layer === 0 && layers.length === 2 && !profile.curve) {
        const k = positions.length / 3;
        positions.push(...points[2], ...points[3]);
        indices.push(bottomCentre, k, k + 1);
      }
    }
    distance += segment;
  }
  const boundaryTriangles = [];
  for (let i = topIndexCount; i < indices.length; i += 3) boundaryTriangles.push(indices.slice(i, i + 3));
  const data = { positions, indices, topIndexCount, triangles, bins, sideQuads, wallTriangles, boundaryTriangles, cellX: width / nx, cellZ: depth / nz };
  cache.set(object, { data, width, height, depth, ...profile, gridSource: current?.surfaceGrid, gridHeights: current?.surfaceGrid?.heights }); return data;
}

// Ray crossings through the actual wall triangles at a local height. Lower cliff bands
// only recess inward; the volume expands toward the unchanged upper surface.
export function terrainContainsAtHeight(object, x, y, z) {
  const top = sampleTerrain(object, x, z);
  if (top === null || y < -object.size[1] / 2 || y > top) return false;
  if (!object.terrainProfile.cliffRelief) return true;
  const data = terrainMeshData(object), p = data.positions;
  const crossings = [];
  for (const [a, b, c] of data.wallTriangles) {
    const ay = p[a * 3 + 1], az = p[a * 3 + 2], by = p[b * 3 + 1], bz = p[b * 3 + 2], cy = p[c * 3 + 1], cz = p[c * 3 + 2];
    const denominator = (bz - cz) * (ay - cy) + (cy - by) * (az - cz);
    if (Math.abs(denominator) < 1e-12) continue;
    const wa = ((bz - cz) * (y - cy) + (cy - by) * (z - cz)) / denominator;
    const wb = ((cz - az) * (y - cy) + (ay - cy) * (z - cz)) / denominator;
    if (wa < -1e-8 || wb < -1e-8 || wa + wb > 1 + 1e-8) continue;
    const hit = wa * p[a * 3] + wb * p[b * 3] + (1 - wa - wb) * p[c * 3];
    if (Math.abs(hit - x) < 1e-7) return true;
    if (hit > x && !crossings.some(v => Math.abs(v - hit) < 1e-7)) crossings.push(hit);
  }
  return crossings.length % 2 === 1;
}

// Barycentric interpolation uses the rendered triangle diagonal, not a different height function.
export function sampleTerrain(object, x, z) {
  const data = terrainMeshData(object);
  // A world/local round trip can put a boundary vertex a few ulps in the next bin.
  const ix = Math.floor(x / data.cellX), iz = Math.floor(z / data.cellZ);
  let candidates = data.bins.get(`${ix}:${iz}`) || [];
  const cellIndices = (value, size) => [Math.floor((value - 1e-7) / size), Math.floor((value + 1e-7) / size)];
  const [xmin, xmax] = cellIndices(x, data.cellX), [zmin, zmax] = cellIndices(z, data.cellZ);
  if (xmin !== xmax || zmin !== zmax) {
    candidates = [];
    for (let bx = xmin; bx <= xmax; bx++) for (let bz = zmin; bz <= zmax; bz++) candidates.push(...(data.bins.get(`${bx}:${bz}`) || []));
  }
  for (const [a, b, c] of candidates) {
    const p = data.positions;
    const ax = p[a * 3], az = p[a * 3 + 2], bx = p[b * 3], bz = p[b * 3 + 2], cx = p[c * 3], cz = p[c * 3 + 2];
    const denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(denominator) < 1e-12) continue;
    const wa = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / denominator;
    const wb = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / denominator;
    const wc = 1 - wa - wb;
    if (wa >= -1e-7 && wb >= -1e-7 && wc >= -1e-7) return wa * p[a * 3 + 1] + wb * p[b * 3 + 1] + wc * p[c * 3 + 1];
  }
  return null;
}

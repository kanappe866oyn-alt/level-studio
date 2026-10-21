import { placeBuildingFrontGardens } from './buildingFrontGardens.js';
import { DEFAULT_SPATIAL_PLAN, SPATIAL_GRID, independentRouteCount, validateSpatialPlan, spatialCornerInset } from './spatialPlan.js';
import { placeTerrainGardenClusters } from './terrainGardenClusters.js';
import { placeTerrainOuterGardens } from './terrainOuterGardens.js';
import { finishTerrainLandscape } from './terrainLandscapeFinish.js';
import { placeStreetTreeGardens } from './streetTreeGardens.js';
import { finishTerrainDistrictColors } from './terrainDistrictColors.js';
import { placeTerrainLongSightScreens } from './terrainLongSightScreens.js';
import { analyzeWalkability } from './walkability.js';
import { getBounds, createSpatialWorld, WALKING, isWalkable, getCollisionParts, boxesOverlap } from './spatialGeometry.js';
import { advanceWalker } from './walkingPhysics.js';
import { inspectSpatialSightlines } from './spatialSightlines.js';
import { generatePlannedStage } from './plannedGeneration.js';
import { getStairLayout } from './assemblySizing.js';
import { decorateSpatialStage } from './spatialAppearance.js';
import { buildSpatialTerrain } from './spatialTerrain.js';
import { inspectTerrainJoins } from './terrainJoins.js';
import { placeTerrainModels } from './spatialTerrainModels.js';
import { placePathScreens } from './pathScreens.js';
import { placePlazaFurniture } from './spatialPlazaFurniture.js';
import { placeBuildingFoundations } from './buildingFoundations.js';
import { placeBuildingCanopies } from './buildingCanopies.js';
import { finishTerrainBuildingColors } from './buildingAppearance.js';
import { reserveBuildingPlots, inspectBuildingApproaches } from './buildingPlots.js';
import { CURVE_STEPS, curveOffset, spatialConnectionPoints, curvedStairRows, connectionWidth } from './terrainCurve.js';
import { readSpatialRequest, spatialRequestProblems, inspectSpatialRequest, spatialRequestPrompt } from './spatialRequest.js';

const box = (id, name, role, pos, size, color = '#80909c', yaw = 0) => ({ id, name, role, type: 'box', pos, size, rot: [0, yaw, 0], color, variant: 1, material: 0 });
const overlapXZ = (a, b) => a.minX < b.maxX - 0.01 && a.maxX > b.minX + 0.01 && a.minZ < b.maxZ - 0.01 && a.maxZ > b.minZ + 0.01;
const separated = (a, b) => a.top + 0.3 <= b.bottom || b.top + 0.3 <= a.bottom;

function conditionContract(input) {
  const r = input?.requirements;
  if (!Number.isInteger(r?.minimumRoutes) || r.minimumRoutes < 1 || r.minimumRoutes > 3 || !Array.isArray(r.sightlines) || r.sightlines.length > 16 || !Array.isArray(input.areas)) return null;
  const boundIds = new Set();
  const pairs = new Set();
  for (const s of r.sightlines) {
    if (!s || typeof s.from !== 'string' || typeof s.to !== 'string' || s.from === s.to || !['visible', 'hidden'].includes(s.relation)) return null;
    const key = [s.from, s.to].sort().join(':');
    if (pairs.has(key)) return null;
    pairs.add(key); boundIds.add(s.from); boundIds.add(s.to);
  }
  if (input.areas.filter(a => a?.kind === 'entry').length !== 1 || input.areas.filter(a => a?.kind === 'goal').length !== 1) return null;
  const anchors = input.areas.filter(a => a && (['entry', 'goal'].includes(a.kind) || boundIds.has(a.id)));
  if ([...boundIds].some(id => anchors.filter(a => a.id === id).length !== 1) || anchors.some(a => typeof a.id !== 'string' || typeof a.name !== 'string' || typeof a.kind !== 'string')) return null;
  return { conditions: { minimumRoutes: r.minimumRoutes, sightlines: r.sightlines.map(({ from, to, relation }) => ({ from, to, relation })).sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`)) },
    anchors: anchors.map(({ id, name, kind }) => ({ id, name, kind })).sort((a, b) => a.id.localeCompare(b.id)) };
}

export function buildSpatialStage(input = DEFAULT_SPATIAL_PLAN, mode = 'free') {
  if (mode !== 'free') throw new Error('立体マップの設計は自由制作で使用してください。');
  const plan = validateSpatialPlan(input);
  const areas = plan.areas.map(a => ({ ...a, x: a.gx * SPATIAL_GRID, z: a.gz * SPATIAL_GRID, y: a.level * 4 }));
  const byId = new Map(areas.map(a => [a.id, a]));
  const roomBounds = a => ({ minX: a.x - a.width / 2 - 0.25, maxX: a.x + a.width / 2 + 0.25, minZ: a.z - a.depth / 2 - 0.25, maxZ: a.z + a.depth / 2 + 0.25, bottom: a.y - 0.3, top: a.y + 2.8 });
  for (let i = 0; i < areas.length; i++) for (let j = i + 1; j < areas.length; j++) {
    const a = roomBounds(areas[i]), b = roomBounds(areas[j]);
    if (overlapXZ(a, b) && !separated(a, b)) throw new Error(`${areas[i].id}と${areas[j].id}: 部屋が重なっています。位置・階層を変更してください。`);
  }
  const connections = plan.connections.map((c, i) => {
    const first = byId.get(c.from), second = byId.get(c.to);
    const low = first.y <= second.y ? first : second, high = low === first ? second : first;
    const axis = low.x === high.x ? 'z' : 'x', delta = high[axis] - low[axis], direction = Math.sign(delta);
    const extent = axis === 'x' ? 'width' : 'depth';
    const start = low[axis] + direction * low[extent] / 2, end = high[axis] - direction * high[extent] / 2;
    const length = Math.abs(end - start), rise = high.y - low.y;
    const minimumCurveRun = rise && c.traversal !== 'ramp' ? 6 : 8;
    if (c.curve && length < Math.max(minimumCurveRun, Math.abs(c.curve) * 3)) throw new Error(`${c.from}:${c.to}: 曲がる道が短すぎます。実長${minimumCurveRun}m以上・変位の3倍以上が必要です。`);
    if (c.traversal === 'ramp' && length < rise * 3) throw new Error(`${c.from}:${c.to}: 坂が急すぎます。通路長を高低差の3倍以上にしてください。`);
    if (rise && length < rise * 1.2) throw new Error(`${c.from}:${c.to}: 階段が急すぎます。エリアを離すか部屋を小さくしてください。`);
    const x = axis === 'x' ? (start + end) / 2 : low.x, z = axis === 'z' ? (start + end) / 2 : low.z;
    const yaw = Math.atan2(high.x - low.x, high.z - low.z);
    const mouthWidth = c.width + 2 * (c.flare || 0);
    if (c.flare) for (const a of [first, second]) {
      const cut = a.footprint === 'inset-corners' ? spatialCornerInset(a) : Math.min(1.5, Math.max(0, (Math.min(a.width, a.depth) - 6) / 2));
      if (mouthWidth + 0.5 > a[axis === 'z' ? 'width' : 'depth'] - 2 * cut + 1e-8) throw new Error(`${c.from}:${c.to}: 広がった道の入口が広場の辺に収まりません。幅か広がりを減らしてください。`);
    }
    const envelopeWidth = mouthWidth + 2 * Math.abs(c.curve || 0);
    const bounds = { minX: x - (axis === 'x' ? length / 2 : envelopeWidth / 2 + 0.25), maxX: x + (axis === 'x' ? length / 2 : envelopeWidth / 2 + 0.25),
      minZ: z - (axis === 'z' ? length / 2 : envelopeWidth / 2 + 0.25), maxZ: z + (axis === 'z' ? length / 2 : envelopeWidth / 2 + 0.25), bottom: low.y - 0.3, top: high.y + 2.8 };
    return { ...c, object_id: `sp_link_${i}`, low: low.id, high: high.id, axis, direction, start, end, x, z, length, rise, yaw, bounds };
  });
  for (const c of connections) for (const a of areas) {
    if (a.id === c.from || a.id === c.to) continue;
    if (overlapXZ(c.bounds, roomBounds(a)) && !separated(c.bounds, roomBounds(a))) throw new Error(`${c.from}:${c.to}: ${a.id}を横切っています。交差点のエリアで接続を分割してください。`);
  }
  for (let i = 0; i < connections.length; i++) for (let j = i + 1; j < connections.length; j++) {
    const a = connections[i], b = connections[j];
    if (overlapXZ(a.bounds, b.bounds) && !separated(a.bounds, b.bounds)) throw new Error(`${a.from}:${a.to}と${b.from}:${b.to}: 通路が交差・重複しています。交差点のエリアを追加してください。`);
  }
  let objects = [];
  for (const a of areas) {
    const inset = spatialCornerInset(a);
    objects.push(box(`sp_area_${a.id}`, a.name, 'bridge', [a.x, a.y - 0.15, a.z], [a.width, 0.3, a.depth - 2 * inset], a.level ? '#a6bad2' : '#b5c3c9'));
    if (inset) for (const direction of [-1, 1]) {
      objects.push(box(`sp_area_${a.id}_floor_${direction < 0 ? 'north' : 'south'}`, `${a.name}の張り出し`, 'bridge',
        [a.x, a.y - 0.15, a.z + direction * (a.depth / 2 - inset / 2)], [a.width - 2 * inset, 0.3, inset], a.level ? '#a6bad2' : '#b5c3c9'));
    }
    // Wall segments leave actual portals only where an explicit connection exists.
    for (const side of ['north', 'south', 'west', 'east']) {
      const axis = ['north', 'south'].includes(side) ? 'z' : 'x';
      const direction = ['north', 'west'].includes(side) ? -1 : 1;
      const dimension = (axis === 'z' ? a.width : a.depth) - 2 * inset;
      const links = connections.filter(c => (c.from === a.id || c.to === a.id) && c.axis === axis && Math.sign(byId.get(c.from === a.id ? c.to : c.from)[axis] - a[axis]) === direction);
      if (links.length > 1) throw new Error(`${a.id}.${side}: 同じ出口に接続が重複しています。分岐エリアを追加してください。`);
      const opening = links.length ? links[0].width + 2 * (links[0].flare || 0) + 0.5 : 0;
      const spans = opening ? [[-(dimension + opening) / 4, (dimension - opening) / 2], [(dimension + opening) / 4, (dimension - opening) / 2]] : [[0, dimension]];
      const height = a.enclosure === 'open' ? 0.8 : 2.8;
      spans.forEach(([offset, length], i) => {
        const x = axis === 'x' ? a.x + direction * (a.width / 2 + 0.125) : a.x + offset;
        const z = axis === 'z' ? a.z + direction * (a.depth / 2 + 0.125) : a.z + offset;
        objects.push(box(`sp_wall_${a.id}_${side}_${i}`, `${a.name}の${opening ? '入口脇の壁' : '境界'}`, 'wall', [x, a.y + height / 2, z], axis === 'x' ? [0.25, height, length + 0.25] : [length + 0.25, height, 0.25]));
      });
    }
    if (inset) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const height = a.enclosure === 'open' ? 0.8 : 2.8;
      objects.push(box(`sp_wall_${a.id}_inset_${sx}_${sz}_x`, `${a.name}のくぼみの境界`, 'wall',
        [a.x + sx * (a.width / 2 - inset / 2), a.y + height / 2, a.z + sz * (a.depth / 2 - inset)], [inset + 0.25, height, 0.25]));
      objects.push(box(`sp_wall_${a.id}_inset_${sx}_${sz}_z`, `${a.name}のくぼみの境界`, 'wall',
        [a.x + sx * (a.width / 2 - inset), a.y + height / 2, a.z + sz * (a.depth / 2 - inset / 2)], [0.25, height, inset + 0.25]));
    }
    const role = a.kind === 'entry' ? 'spawn' : a.kind === 'goal' ? 'goal' : 'checkpoint';
    objects.push(box(`sp_marker_${a.id}`, `${a.name}の確認地点`, role, [a.x, a.y + 0.05, a.z], [1, 0.1, 1], role === 'spawn' ? '#55cbb6' : role === 'goal' ? '#edc66d' : '#82baff'));
  }
  for (const c of connections) {
    const low = byId.get(c.low);
    objects.push(box(c.object_id, `${byId.get(c.from).name}〜${byId.get(c.to).name}`, c.rise ? 'climb' : 'bridge', [c.x, low.y + (c.rise ? c.rise / 2 : -0.15), c.z], [c.width + 2 * ((c.flare || 0) + Math.abs(c.curve || 0)), c.rise || 0.3, c.length], '#b9a78c', c.yaw));
    if (c.curve || c.flare) {
      const stairCount = c.rise && c.traversal !== 'ramp' ? getStairLayout([c.width, c.rise, c.length]).count : 0;
      const rows = stairCount ? curvedStairRows(stairCount) : Array.from({ length: CURVE_STEPS + 1 }, (_, i) => ({ t: i / CURVE_STEPS }));
      for (const side of [-1, 1]) for (let i = 0; i < rows.length - 1; i++) {
        if (rows[i + 1].t - rows[i].t < 1e-8) continue;
        const point = t => {
          const x = curveOffset((c.low === c.from ? 1 : -1) * (c.curve || 0), t) + side * (connectionWidth(c.width, c.flare, t) / 2 + 0.125), z = (t - 0.5) * c.length;
          return [c.x + Math.cos(c.yaw) * x + Math.sin(c.yaw) * z, c.z - Math.sin(c.yaw) * x + Math.cos(c.yaw) * z];
        };
        const [ax, az] = point(rows[i].t), [bx, bz] = point(rows[i + 1].t), height = c.enclosure === 'open' ? 0.8 : 2.8;
        const bottom = low.y + c.rise * (stairCount ? rows[i].height - 1 / stairCount : rows[i].t);
        const top = low.y + c.rise * (stairCount ? rows[i].height : rows[i + 1].t) + height;
        objects.push(box(`${c.object_id}_wall_${side}_${i}`, '曲がる道の境界壁', 'wall', [(ax + bx) / 2, (bottom + top) / 2, (az + bz) / 2],
          [0.25, top - bottom, Math.hypot(bx - ax, bz - az) + 0.04], '#7b8b98', Math.atan2(bx - ax, bz - az)));
      }
      continue;
    }
    for (const side of [-1, 1]) {
      const offset = side * (c.width / 2 + 0.125), wallHeight = c.enclosure === 'open' ? 0.8 : 2.8;
      const steps = c.rise ? (c.traversal === 'ramp' ? 32 : getStairLayout([c.width, c.rise, c.length]).count) : 1;
      for (let i = 0; i < steps; i++) {
        const along = -c.length / 2 + c.length / steps * (i + 0.5), height = wallHeight + c.rise * (i + 1) / steps;
        objects.push(box(`${c.object_id}_wall_${side}_${i}`, '通路の境界壁', 'wall',
          [c.x + Math.cos(c.yaw) * offset + Math.sin(c.yaw) * along, low.y + height / 2, c.z - Math.sin(c.yaw) * offset + Math.cos(c.yaw) * along],
          [0.25, height, c.length / steps], '#7b8b98', c.yaw));
      }
    }
  }
  if (plan.buildings?.length) objects = reserveBuildingPlots(objects, areas, plan.buildings);
  if (plan.foundation === 'terrain') objects = buildSpatialTerrain(objects, connections, areas, plan.openRailings, plan.requirements, { sharedSupportJoints: plan.sharedSupportJoints });
  const bounds = objects.map(getBounds), minX = Math.min(...bounds.map(b => b.minX)) - 2, maxX = Math.max(...bounds.map(b => b.maxX)) + 2;
  const minZ = Math.min(...bounds.map(b => b.minZ)) - 2, maxZ = Math.max(...bounds.map(b => b.maxZ)) + 2;
  const size = [maxX - minX, maxZ - minZ], centre = [(minX + maxX) / 2, (minZ + maxZ) / 2];
  // The foundation is deliberately below the playable floors. A hazard prevents
  // it from becoming an unplanned route if a player leaves the bounded paths.
  objects.unshift(box('sp_ground', '構造の下の土台', 'ground', [centre[0], -9, centre[1]], [size[0], 1, size[1]], '#465660'));
  objects.push(box('sp_void', '経路外の落下範囲', 'pit', [centre[0], -8.5, centre[1]], [size[0], 0.1, size[1]], '#465660'));
  return { objects, areas, connections, plan, design_rationale: {
    ground_size: size, overall_intent: plan.intent,
    spatial_plan: `${areas.length}エリア・${connections.length}接続・${independentRouteCount(areas, connections)}本の独立経路。床高さは${[...new Set(areas.map(a => a.y))].sort((a, b) => a - b).join('/')}m、接続位置に開口部を配置。${plan.foundation === 'terrain' ? '広場と地上通路は厚い地形、緩やかな上りは坂として生成し、下層通路のある位置は橋として保持。' : ''}経路外の土台は歩行経路に使用しません。`,
    key_decisions: connections.map(c => ({ object_id: c.object_id, reason: `${byId.get(c.from).name}から${byId.get(c.to).name}へ${c.traversal === 'ramp' ? '坂' : c.rise ? '階段' : '通路'}で接続。幅${c.width}m。` })),
    tradeoffs: [...plan.limitations, `歩行検証は0.5mの格子${plan.foundation === 'terrain' ? 'と描画と同じ地形三角形' : 'と箱形状による近似'}、視線検証は各エリア9地点の目線です。競技バランスはプレイ確認が必要です。`],
    spatial_design: { version: 1, plan },
  } };
}

export function inspectSpatialStage(stage) {
  const navigation = analyzeWalkability(stage.objects, stage.plan.foundation === 'terrain' ? { maxCells: stage.plan.buildings?.length ? 125000 : 75000 } : undefined);
  const sightlines = inspectSpatialSightlines(stage.objects, stage.areas, stage.plan.requirements.sightlines);
  const terrainJoins = inspectTerrainJoins(stage.objects, stage.plan);
  const issues = [...navigation.issues, ...terrainJoins.issues];
  const buildingApproaches = inspectBuildingApproaches(stage);
  for (const b of buildingApproaches.filter(b => !b.passed)) issues.push(`${b.id}: 建物入口前への往復歩行を確認できません。`);
  const brief = stage.design_rationale?.spatial_design?.request_contract;
  if (brief) issues.push(...inspectSpatialRequest(stage.plan, brief, { geometry: true, sightlines }).issues);
  if (navigation.status !== 'checked') issues.push('全エリアへの歩行経路を検証できませんでした。検証範囲を小さくしてください。');
  for (const s of sightlines) if (!s.passed) issues.push(`${s.from}→${s.to}: 「${s.relation === 'visible' ? '見える' : '見えない'}」条件を満たしません（目線の${Math.round(s.ratio * 100)}%が通ります）。壁・高さ・接続を修正してください。`);
  return { issues, navigation, sightlines, buildingApproaches, terrainJoins, independentRoutes: independentRouteCount(stage.plan.areas, stage.plan.connections) };
}

export function inspectConnectionWalking(stage) {
  const world = createSpatialWorld(stage.objects);
  const check = (a, b) => {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1);
    let height = a.y;
    for (let i = 0; i <= steps; i++) {
      const x = a.x + (b.x - a.x) * i / steps, z = a.z + (b.z - a.z) * i / steps;
      const floor = world.floor(x, z, height);
      if (!Number.isFinite(floor) || Math.abs(floor - height) > WALKING.stepHeight + 1e-5 || world.dangerous(x, z, floor)) return false;
      height = floor;
    }
    return Math.abs(height - b.y) < 0.05;
  };
  return stage.connections.map(c => {
    const a = stage.areas.find(a => a.id === c.from), b = stage.areas.find(a => a.id === c.to);
    const points = spatialConnectionPoints(a, b, c);
    const walk = list => list.slice(1).every((point, i) => check(list[i], point));
    return { ...c, forward: walk(points), backward: walk([...points].reverse()) };
  });
}

// Try a bounded local geometry repair before requesting another AI plan. Only a
// full, low boundary of an open high area may become a frame; portals stay solid.
function tryVistaRailAdjustment(stage, brief) {
  if (!brief.conditions.some(c => c.kind === 'sight' && c.minVisibleRatio === 0.5)) return stage;
  const measure = objects => inspectSpatialSightlines(objects, stage.areas, stage.plan.requirements.sightlines);
  const before = measure(stage.objects);
  const actual = inspectSpatialRequest(stage.plan, brief, { geometry: true, sightlines: before });
  if (!actual.issues.length) return stage;
  const weak = actual.rows.filter(row => !row.passed && brief.conditions.some(c => c.id === row.id && c.minVisibleRatio === 0.5));
  if (!weak.length || actual.rows.some(row => !row.passed && !weak.includes(row)) || before.some(s => s.relation === 'hidden' && !s.passed)) return stage;
  const walkingBefore = inspectConnectionWalking(stage);
  if (walkingBefore.some(c => !c.forward || !c.backward)) return stage;
  const proposals = new Map();
  for (const row of weak) {
    const from = stage.areas.find(a => a.id === row.from), to = stage.areas.find(a => a.id === row.to);
    if (!from || !to || from.kind !== 'high' || from.enclosure !== 'open' || from.y <= to.y) continue;
    for (const [axis, negative, positive] of [['x', 'west', 'east'], ['z', 'north', 'south']]) {
      const delta = to[axis] - from[axis];
      if (!delta) continue;
      const side = delta > 0 ? positive : negative, prefix = `sp_wall_${from.id}_${side}_`;
      const wall = stage.objects.find(o => o.id === `${prefix}0`);
      // A second span means a doorway: never alter the portal's side walls.
      if (!wall || stage.objects.some(o => o.id === `${prefix}1`) || Math.abs(wall.size[1] - 0.8) > 0.001) continue;
      proposals.set(wall.id, { wall, from, axis });
    }
  }
  for (const { wall, from, axis } of [...proposals.values()].slice(0, 8)) {
    const along = axis === 'x' ? 2 : 0, normal = axis === 'x' ? 0 : 2;
    const part = (suffix, name, bottom, height, offset = 0, length = wall.size[along]) => {
      const pos = [...wall.pos], size = [...wall.size];
      pos[1] = bottom + height / 2; pos[along] += offset;
      size[1] = height; size[along] = length; size[normal] = wall.size[normal];
      return { ...wall, id: suffix ? `${wall.id}_vista_${suffix}` : wall.id, name, pos, size };
    };
    const top = part('', `${from.name}の見通し用手すり`, from.y + 0.68, 0.12);
    const extra = [part('base', '手すりの下桟', from.y, 0.12),
      ...[-1, 1].map((side, i) => part(`post_${i}`, '手すりの端柱', from.y, 0.8, side * (wall.size[along] / 2 - 0.1), 0.2))];
    const candidate = { ...stage, objects: [...stage.objects.map(o => o.id === wall.id ? top : o), ...extra] };
    const after = measure(candidate.objects);
    if (after.some(s => !s.passed) || inspectSpatialRequest(stage.plan, brief, { geometry: true, sightlines: after }).issues.length) continue;
    const walking = inspectConnectionWalking(candidate);
    if (JSON.stringify(walking) !== JSON.stringify(walkingBefore)) continue;
    const world = createSpatialWorld(candidate.objects);
    const boundaryChecks = Array.from({ length: 19 }, (_, i) => {
      const fraction = (i - 9) / 20;
      let state = { x: from.x, y: from.y, z: from.z, vy: 0 };
      const alongName = axis === 'x' ? 'z' : 'x';
      state[alongName] += fraction * (axis === 'x' ? from.depth : from.width);
      const direction = Math.sign(wall.pos[normal] - (axis === 'x' ? from.x : from.z));
      for (let step = 0; step < 200; step++) state = advanceWalker(world, state, axis === 'x' ? direction * 0.05 : 0, axis === 'z' ? direction * 0.05 : 0, 0.01);
      const inside = Math.abs(state[axis] - from[axis]) < (axis === 'x' ? from.width : from.depth) / 2;
      return inside && Math.abs(state.y - from.y) < 0.05;
    });
    if (!boundaryChecks.every(Boolean)) continue;
    const navigation = analyzeWalkability(candidate.objects);
    if (navigation.status !== 'checked' || navigation.issues.length) continue;
    candidate.design_rationale.spatial_design.vista_adjustment = { version: 1, wall: wall.id, before, after, boundarySamples: boundaryChecks.length, walking };
    candidate.design_rationale.key_decisions.push({ object_id: wall.id, reason: '見渡せる条件を満たすため、低い境界を枠状手すりへ調整。エリア・接続・経路距離は維持し、全接続の往復歩行と縁の19地点を再検証しました。' });
    candidate.design_rationale.tradeoffs.push('枠状手すりは身長1.8mの立った歩行で検証しています。ジャンプ・しゃがみ・対戦バランスは検証していません。');
    return candidate;
  }
  return stage;
}

export async function generatePlannedSpatialStage(options) {
  options.signal.throwIfAborted();
  const brief = readSpatialRequest(options.userPrompt || '');
  options.onStatus?.('指示の広さ・高低差・坂や階段・通路幅・視線条件を整理しています。');
  const unsupported = spatialRequestProblems(brief);
  if (unsupported.length) {
    const error = new Error(unsupported.join('\n')); error.code = 'SPATIAL_VALIDATION'; throw error;
  }
  let contract, finishedInspection;
  const buildStage = (input, mode) => {
    finishedInspection = null;
    try {
      const requestIssues = inspectSpatialRequest(input, brief).issues;
      if (requestIssues.length) throw new Error(requestIssues.join('\n'));
      // Capture well-formed conditions even if the initial graph is disconnected.
      // Repairs must solve the geometry instead of reducing the requested routes.
      const candidate = conditionContract(input);
      if (!contract && candidate) contract = candidate;
      else if (contract && JSON.stringify(contract) !== JSON.stringify(candidate)) {
        throw new Error(`修正で元の指定条件・対象エリアを変更しないでください。保持する条件: ${JSON.stringify(contract)}。壁・位置・高さ・接続で解決してください。`);
      }
      const stage = tryVistaRailAdjustment(buildSpatialStage(input, mode), brief);
      const actual = inspectSpatialRequest(stage.plan, brief, { geometry: true,
        sightlines: inspectSpatialSightlines(stage.objects, stage.areas, stage.plan.requirements.sightlines) });
      if (actual.issues.length) throw new Error(actual.issues.join('\n'));
      if (brief.request) stage.design_rationale.spatial_design.request_contract = { ...brief, checks: actual.rows };
      if (options.finish === false) return stage;
      finishedInspection = finishSpatialStageWithReport(stage);
      return finishedInspection.stage;
    } catch (error) {
      error.code = 'SPATIAL_VALIDATION';
      throw error;
    }
  };
  return generatePlannedStage({ ...options, prompt: options.prompt + spatialRequestPrompt(brief), buildStage, label: '立体マップ', assemblyMessage: '壁・階段・開口部を組み立て、全エリアへの歩行と視線を検証しています。',
    validateStage: (objects, stage) => {
      // The assembler and this validator run synchronously, with no edits in
      // between. Reuse only this build's final report, never a global cache.
      const report = finishedInspection?.stage === stage ? finishedInspection.report : inspectSpatialStage(stage);
      stage.design_rationale.spatial_design.validation = { independentRoutes: report.independentRoutes, navigation: report.navigation.status, sightlines: report.sightlines };
      if (typeof options.userPrompt === 'string') stage.design_rationale.spatial_design.request = options.userPrompt;
      stage.design_rationale.key_decisions.push(...report.sightlines.map(s => ({ object_id: `sp_area_${s.from}`, reason: `${s.from}→${s.to}: ${s.relation === 'visible' ? '見える' : '見えない'}条件 ${s.passed ? '確認済み' : '未達'}（${s.visibleSamples}/${s.totalSamples}目線）。` })));
      const issues = [...report.issues, ...(options.validateStage?.(objects, stage) || [])];
      if (issues.length) {
        const error = new Error(issues.slice(0, 6).join('\n'));
        error.code = 'SPATIAL_VALIDATION';
        throw error;
      }
      return [];
    },
  });
}

export function finishSpatialStage(stage) {
  return finishSpatialStageWithReport(stage).stage;
}

// Callers that immediately validate the finished result can consume the report
// computed here. Explicit later inspections always read the current geometry.
export function finishSpatialStageWithReport(stage) {
  if (stage.plan.foundation === 'terrain') {
    const before = inspectSpatialStage(stage), walking = inspectConnectionWalking(stage);
    if (before.issues.length || walking.some(c => !c.forward || !c.backward)) throw new Error('モデル配置の前に土台の歩行・視線を確認してください。');
    let finished = finishTerrainBuildingColors(placeTerrainModels(placePathScreens(placePlazaFurniture(placeBuildingFrontGardens(placeBuildingCanopies(placeBuildingFoundations(stage)))))));
    const variation = stage.design_rationale.spatial_design.variation;
    if (variation?.version >= 12 && variation.family === 'terraces' || variation?.version >= 20 && ['market', 'bridge', 'cloister'].includes(variation.family)) {
      finished = placeTerrainGardenClusters(finished);
      finished.design_rationale.spatial_design.terrain_gardens = finished.gardenClusters;
    }
    finished = placeStreetTreeGardens(finishTerrainLandscape(finishTerrainDistrictColors(placeTerrainOuterGardens(placeTerrainLongSightScreens(finished)))));
    const after = inspectSpatialStage(finished);
    if (after.issues.length || JSON.stringify(after.sightlines) !== JSON.stringify(before.sightlines) || JSON.stringify(inspectConnectionWalking(finished)) !== JSON.stringify(walking)) throw new Error('モデル配置で歩行・指定視線が変わるため採用できませんでした。');
    finished.design_rationale.spatial_design.terrain_models.navigation = after.navigation.status;
    return { stage: finished, report: after };
  }
  const before = inspectSpatialStage(stage);
  const walkingBefore = inspectConnectionWalking(stage);
  const walkingCache = new WeakMap();
  const walkingFor = candidate => {
    if (!walkingCache.has(candidate)) walkingCache.set(candidate, inspectConnectionWalking(candidate));
    return walkingCache.get(candidate);
  };
  if (before.issues.length) {
    const error = new Error(`外観を仕上げる前に構造を確認してください。${before.issues.slice(0, 4).join('\n')}`);
    error.code = 'SPATIAL_VALIDATION'; throw error;
  }
    // Preserve the full lower floor footprint, including manually added paths
    // outside the sampled connection centre lines. Bounds are conservative.
    const clearances = stage.objects.filter(o => isWalkable(o) && o.id !== 'sp_ground').flatMap(getCollisionParts).map(o => ({
      ...o, pos: [o.pos[0], o.pos[1] + o.size[1] / 2 + WALKING.height / 2, o.pos[2]],
      size: [o.size[0] + 2 * WALKING.radius, WALKING.height, o.size[2] + 2 * WALKING.radius],
    }));
    const protectedCategories = ['support', 'foundation', 'building'];
    const supportsClear = candidate => candidate.objects.filter(o => protectedCategories.includes(o.spatialAppearance?.category)).every(o => !clearances.some(c => boxesOverlap(o, c)));
    const matches = (report, candidate) => supportsClear(candidate) && !report.issues.length && JSON.stringify(report.navigation.reachable) === JSON.stringify(before.navigation.reachable) && report.sightlines.every((s, i) => s.visibleSamples === before.sightlines[i].visibleSamples) && JSON.stringify(walkingFor(candidate)) === JSON.stringify(walkingBefore);
  let finished = decorateSpatialStage(stage), report = inspectSpatialStage(finished), architectureAccepted = true;
  const rejectedGroups = [];
  if (!matches(report, finished)) {
    const candidates = finished.objects.filter(o => ['support', 'backdrop', 'roof', 'portal', 'sign', 'foundation', 'building'].includes(o.spatialAppearance?.category));
    const groups = new Map();
    for (const o of candidates) {
      const bridge = /^sp_finish_bridge_(sp_link_\d+)_/.exec(o.id);
      const key = o.spatialAppearance.moduleId ? `module:${o.spatialAppearance.moduleId}` : o.spatialAppearance.areaId ? `${o.spatialAppearance.category === 'support' ? 'support' : 'room'}:${o.spatialAppearance.areaId}` : bridge ? `bridge:${bridge[1]}` : 'backdrop';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(o);
    }
    finished = decorateSpatialStage(stage, { architecture: false });
    for (const [key, objects] of groups) {
      const candidate = { ...finished, objects: [...finished.objects, ...objects] };
      if (key.startsWith('module:')) {
        // These modules add no walkable surfaces. Protect every existing floor
        // footprint first, then the exact authored sight samples. One full
        // navigation check after assembly still validates the accepted union.
        const sightlines = supportsClear(candidate) ? inspectSpatialSightlines(candidate.objects, stage.areas, stage.plan.requirements.sightlines) : null;
        if (sightlines && sightlines.every((s, i) => s.visibleSamples === before.sightlines[i].visibleSamples)) finished = candidate;
        else rejectedGroups.push(key);
        continue;
      }
      const checked = inspectSpatialStage(candidate);
      if (matches(checked, candidate)) finished = candidate;
      else rejectedGroups.push(key);
    }
    report = inspectSpatialStage(finished); architectureAccepted = rejectedGroups.length === 0;
  }
  if (!matches(report, finished)) throw new Error('外観が歩行または視線を変更するため、仕上げを採用できません。');
  finished.design_rationale.spatial_design.validation = { independentRoutes: report.independentRoutes, navigation: report.navigation.status, sightlines: report.sightlines };
  finished.design_rationale.spatial_design.finish = { ...finished.design_rationale.spatial_design.finish, addedObjects: finished.objects.filter(o => o.id.startsWith('sp_finish_')).length, architectureAccepted, rejectedGroups,
    buildingModules: new Set(finished.objects.filter(o => o.spatialAppearance?.category === 'building').map(o => o.spatialAppearance.moduleId)).size,
    foundationObjects: finished.objects.filter(o => o.spatialAppearance?.category === 'foundation').length,
    navigation: report.navigation.status, sightlinesPreserved: true, connectionWalking: walkingBefore };
  finished.design_rationale.tradeoffs.push(architectureAccepted ? '外観: 屋根・入口枠・庇・看板・橋脚・周囲の建物を加えた後も歩行と指定された81組の視線を再検証し、仕上げ前の結果を保持しました。' : `外観: 歩行・視線に影響する部材をエリア単位で除外しました（${rejectedGroups.join(', ')}）。採用した部材は再検証済みです。`);
  return { stage: finished, report };
}

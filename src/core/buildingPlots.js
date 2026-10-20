import { buildingPlotLayout, scaledBuildingEntry } from './buildingKit.js';
import { getBounds, isWalkable, createSpatialWorld, worldXZ, localXZ, surfaceTop, WALKING } from './spatialGeometry.js';
import { bevelSegments } from './terrainContours.js';

const box = (id, name, role, pos, size, yaw = 0) => ({ id, name, role, type: 'box', pos, size, rot: [0, yaw, 0], color: '#a8b39b', variant: 1, material: 0 });
const overlaps = (a, b) => a.minX < b.maxX - 0.01 && a.maxX > b.minX + 0.01 && a.minZ < b.maxZ - 0.01 && a.maxZ > b.minZ + 0.01;

export function reserveBuildingPlots(objects, areas, plots = []) {
  let result = [...objects];
  const reserved = objects.filter(isWalkable);
  for (const plot of plots) {
    const a = areas.find(a => a.id === plot.from);
    const { nx, nz, yaw, radius, approachLength, lot, x, z, root, units } = buildingPlotLayout(plot, a);
    const width = plot.approachWidth ?? 3, forecourtWidth = plot.forecourtWidth ?? 5, cut = 0.8;
    const soil = (id, name, px, pz, w, d, angle) => ({ ...box(id, name, 'landform', [px, (a.y - 3) / 2, pz], [w, a.y + 3, d], angle),
      color2: '#82786b', terrainProfile: { seed: 0, relief: 0, edgeRoughness: 0, cliffRelief: 0.35 } });
    const pad = soil(`${root}_pad`, `${a.name}につながる建物の平場`, x, z, lot[0], lot[1], yaw);
    pad.terrainProfile.cornerCut = cut;
    const path = soil(`${root}_approach`, `${a.name}から建物入口への枝道`, a.x + nx * (radius + approachLength / 2), a.z + nz * (radius + approachLength / 2), forecourtWidth, approachLength, yaw);
    path.terrainProfile.widthScale = [1, width / forecourtWidth];
    for (const part of [pad, path]) if (reserved.some(o => overlaps(getBounds(part), getBounds(o)))) throw new Error(`${plot.id}: 建物の平場・枝道が既存の床や通路に重なります。別の辺を指定してください。`);
    reserved.push(pad, path);
    const wallId = `sp_wall_${a.id}_${plot.side}_0`, wall = result.find(o => o.id === wallId);
    if (!wall || result.some(o => o.id === `sp_wall_${a.id}_${plot.side}_1`)) throw new Error(`${plot.id}: 枝道を開ける境界を確認できません。`);
    const along = nx ? 2 : 0, opening = width + 0.5, span = (wall.size[along] - opening) / 2;
    if (span < 0.2) throw new Error('建物の枝道を開けるには広場の辺が短すぎます。');
    result = result.filter(o => o.id !== wallId);
    for (const side of [-1, 1]) {
      const pos = [...wall.pos], size = [...wall.size]; pos[along] += side * (opening + span) / 2; size[along] = span;
      result.push({ ...wall, id: `${wallId}_building_${side}`, pos, size });
    }
    const models = units.map((unit, i) => ({ ...box(`${unit.root}_model`, `${a.name}沿いの建物${units.length > 1 ? ` ${i + 1}` : ''}`, 'building', [unit.x, a.y + unit.kit.size[1] / 2, unit.z], [...unit.kit.size], yaw), color: null, variant: unit.variant,
      modelDimensions: { path: unit.kit.ref.path, size: [...unit.kit.ref.bounds.size], defaultScale: unit.kit.ref.scale },
      buildingPlacement: { plotId: plot.id, from: a.id, side: plot.side } }));
    result.push(pad, path, ...models);
    // Low boundaries isolate this side branch from other routes and the terrain outside.
    for (const s of [-1, 1]) {
      const p = worldXZ(path, s * (forecourtWidth / 2 + 0.125), -approachLength / 2);
      const q = worldXZ(path, s * (width / 2 + 0.125), approachLength / 2);
      result.push(box(`${root}_path_wall_${s}`, '建物への枝道の境界', 'wall', [(p[0] + q[0]) / 2, a.y + 0.4, (p[1] + q[1]) / 2],
        [0.25, 0.8, Math.hypot(q[0] - p[0], q[1] - p[1]) + 0.125], Math.atan2(q[0] - p[0], q[1] - p[1])));
    }
    for (const side of ['front', 'back', 'left', 'right']) {
      const vertical = ['left', 'right'].includes(side), direction = ['back', 'left'].includes(side) ? -1 : 1;
      const length = (vertical ? lot[1] : lot[0]) - 2 * cut, gate = forecourtWidth + 0.5;
      const spans = side === 'front' ? [[-(length + gate) / 4, (length - gate) / 2], [(length + gate) / 4, (length - gate) / 2]] : [[0, length]];
      spans.forEach(([offset, size], index) => {
        const [wx, wz] = worldXZ(pad, vertical ? direction * (lot[0] / 2 + 0.125) : offset, vertical ? offset : direction * (lot[1] / 2 + 0.125));
        result.push(box(`${root}_wall_${side}_${index}`, '建物の平場の境界', 'wall', [wx, a.y + 0.4, wz], vertical ? [0.25, 0.8, size + 0.25] : [size + 0.25, 0.8, 0.25], yaw));
      });
    }
    bevelSegments(lot[0], lot[1], cut).forEach(([p, q], i) => {
      const [px, pz] = worldXZ(pad, p[0], p[1]), [qx, qz] = worldXZ(pad, q[0], q[1]);
      result.push(box(`${root}_wall_bevel_${i}`, '建物の平場の斜めの境界', 'wall', [(px + qx) / 2, a.y + 0.4, (pz + qz) / 2],
        [0.25, 0.8, Math.hypot(qx - px, qz - pz) + 0.25], Math.atan2(qx - px, qz - pz)));
    });
    for (let i = 0; i < models.length; i++) {
      const model = models[i], entry = scaledBuildingEntry(model), front = entry.front + WALKING.radius + 0.15;
      const [doorX, doorZ] = worldXZ(model, entry.doorX, front);
      const height = entry.ramp.height * (entry.ramp.near - front) / (entry.ramp.near - entry.ramp.far);
      result.push(box(`${units[i].root}_door`, `${model.name}の入口前`, 'checkpoint', [doorX, a.y + height + 0.05, doorZ], [0.6, 0.1, 0.6]));
    }
  }
  return result;
}

export function inspectBuildingApproaches(stage) {
  if (!stage.plan.buildings?.length) return [];
  const world = createSpatialWorld(stage.objects);
  return stage.plan.buildings.flatMap(plot => {
    const from = stage.areas.find(a => a.id === plot.from), layout = buildingPlotLayout(plot, from);
    return layout.units.map(unit => {
      const door = stage.objects.find(o => o.id === `${unit.root}_door`);
      const model = stage.objects.find(o => o.id === `${unit.root}_model`), pad = stage.objects.find(o => o.id === `${layout.root}_pad`);
      const path = stage.objects.find(o => o.id === `sp_build_${plot.id}_approach`);
      const fail = reason => ({ id: unit.id, from: plot.from, passed: false, reason });
      if (!door || !model?.buildingPlacement || !pad || !path) return fail('平場・枝道・建物・入口前の確認地点がありません。');
      const { kit } = unit, { yaw } = layout;
      if (model.variant !== unit.variant || model.size.some((v, i) => Math.abs(v - kit.size[i]) > 0.001) ||
          Math.hypot(model.pos[0] - unit.x, model.pos[2] - unit.z) > 0.03 ||
          Math.abs(model.pos[1] - model.size[1] / 2 - from.y) > 0.03 || Math.abs(Math.sin((model.rot?.[1] || 0) - yaw)) > 0.001 || Math.cos((model.rot?.[1] || 0) - yaw) < 0.999) return fail('設計した建物の寸法・向き・位置が変わっています。');
      const target = { x: door.pos[0], y: door.pos[1] - door.size[1] / 2, z: door.pos[2] };
      const entry = scaledBuildingEntry(model), front = entry.front + WALKING.radius + 0.15, [ex, ez] = worldXZ(model, entry.doorX, front);
      const expectedY = from.y + entry.ramp.height * (entry.ramp.near - front) / (entry.ramp.near - entry.ramp.far);
      if (Math.hypot(target.x - ex, target.z - ez, target.y - expectedY) > 0.03) return fail('入口前の確認地点が実際の入口と一致しません。');
      for (const x of [-0.5, 0, 0.5]) for (const z of [-0.5, 0, 0.5]) {
        const [wx, wz] = worldXZ(model, x * model.size[0], z * model.size[2]);
        const height = surfaceTop(pad, wx, wz);
        if (height === null || Math.abs(height - from.y) > 0.03) return fail('建物の底面を平場で支えられません。');
      }
      const walk = (a, b) => {
        let height = a.y;
        const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1));
        for (let i = 0; i <= steps; i++) {
          const x = a.x + (b.x - a.x) * i / steps, z = a.z + (b.z - a.z) * i / steps, next = world.floor(x, z, height);
          if (!Number.isFinite(next) || Math.abs(next - height) > WALKING.stepHeight || world.dangerous(x, z, next)) return false;
          const [lx, lz] = localXZ(model, x, z);
          const onRamp = Math.abs(lx - entry.ramp.x) <= entry.ramp.width / 2 && lz >= entry.ramp.far && lz <= entry.ramp.near;
          const expected = from.y + (onRamp ? entry.ramp.height * (entry.ramp.near - lz) / (entry.ramp.near - entry.ramp.far) : 0);
          if (Math.abs(next - expected) > 0.05) return false;
          height = next;
        }
        return Math.abs(height - b.y) < 0.05;
      };
      const point = (x, z) => { const [wx, wz] = worldXZ(pad, x, z); return { x: wx, y: from.y, z: wz }; };
      const waypoints = layout.units.length === 1 ? [from, target] : [from, point(0, layout.lot[1] / 2 - 0.5), point(unit.offset + entry.doorX, layout.lot[1] / 2 - 0.5), target];
      const forward = waypoints.slice(1).every((p, i) => walk(waypoints[i], p));
      const backward = waypoints.slice(1).every((p, i) => walk(p, waypoints[i]));
      return { id: unit.id, from: plot.from, target, ...(layout.units.length > 1 ? { waypoints } : {}), forward, backward, passed: forward && backward };
    });
  });
}

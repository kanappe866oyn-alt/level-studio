import { getCollisionParts, isWalkable, surfaceTop, worldXZ, WALKING } from './spatialGeometry.js';
import { PLAYER_EYE_HEIGHT } from './worldScale.js';
import { inspectSpatialSightlines, segmentHitsBox, spatialEyeSamples } from './spatialSightlines.js';

const isScreen = o => o.spatialAppearance?.moduleId?.startsWith('path_screen_');

// Extend existing boundaries upward, keeping their horizontal footprint. Only
// accept a group if it blocks a formerly clear long eye ray without changing
// any authored clear ray or occupying another floor's standing volume.
export function placePathScreens(stage) {
  if (!stage.plan.pathScreens) return stage;
  const original = stage.objects.filter(o => !isScreen(o)), solids = original.flatMap(getCollisionParts);
  const clearRays = stage.plan.requirements.sightlines.flatMap(s => {
    const a = stage.areas.find(a => a.id === s.from), b = stage.areas.find(a => a.id === s.to);
    return spatialEyeSamples(a).flatMap(p => spatialEyeSamples(b).filter(q => !solids.some(o => segmentHitsBox(p, q, o))).map(q => [p, q]));
  });
  const added = [], groups = [], rejected = [];
  for (const c of stage.connections.filter(c => !c.rise && c.enclosure === 'open' && Math.abs(c.curve || 0) >= 2 && c.length >= 18)) {
    const a = stage.areas.find(a => a.id === c.from), b = stage.areas.find(a => a.id === c.to);
    const eye = p => [p.x, p.y + PLAYER_EYE_HEIGHT, p.z], ray = [eye(a), eye(b)];
    if ([...solids, ...added].some(o => segmentHitsBox(...ray, o))) continue;
    const root = `path_screen_${c.object_id}`, parts = [];
    for (const o of original.filter(o => o.id.startsWith(`${c.object_id}_wall_`))) {
      const index = Number(o.id.slice(o.id.lastIndexOf('_') + 1));
      if (index < 3 || index > 20) continue;
      const appearance = { version: 1, style: 'harbor', surface: 'wood', district: 'high', category: 'trim', moduleId: root };
      for (const [suffix, height, y, width, color] of [['panel', 1.5, 1.55, 0.2, '#886344'], ['cap', 0.1, 2.35, 0.25, '#376d72']]) parts.push({
        id: `${root}_${o.id}_${suffix}`, name: '曲がる道の視界を区切る木の壁', role: 'wall', type: 'box', variant: 1, material: 0,
        pos: [o.pos[0], a.y + y, o.pos[2]], size: [width, height, o.size[2]], rot: [...o.rot], color, spatialAppearance: { ...appearance },
      });
    }
    let reason;
    if (parts.some(p => original.some(o => o.id === p.id))) reason = 'identifier';
    else if (!parts.some(o => segmentHitsBox(...ray, o))) reason = 'no-effect';
    else if (parts.some(o => clearRays.some(([p, q]) => segmentHitsBox(p, q, o)))) reason = 'sight';
    else if (parts.some(o => solids.filter(isWalkable).some(f => {
      for (const x of [-0.5, 0, 0.5]) for (const z of [-0.5, 0, 0.5]) {
        const [wx, wz] = worldXZ(o, x * o.size[0], z * o.size[2]), y = surfaceTop(f, wx, wz);
        if (y !== null && y < o.pos[1] + o.size[1] / 2 && y + WALKING.height > o.pos[1] - o.size[1] / 2) return true;
      }
      return false;
    }))) reason = 'standing';
    if (reason) { rejected.push({ from: c.from, to: c.to, reason }); continue; }
    const condition = [{ from: c.from, to: c.to, relation: 'hidden' }];
    const before = inspectSpatialSightlines([...original, ...added], stage.areas, condition)[0];
    const after = inspectSpatialSightlines([...original, ...added, ...parts], stage.areas, condition)[0];
    added.push(...parts); groups.push({ from: c.from, to: c.to, objects: parts.length, centreRayBlocked: true, beforeVisibleSamples: before.visibleSamples, afterVisibleSamples: after.visibleSamples, totalSamples: 81 });
  }
  const rationale = structuredClone(stage.design_rationale);
  rationale.spatial_design.path_screens = { version: 1, groups, rejected, clearEyePairsPreserved: clearRays.length,
    scope: '長い曲線の水平路の中央部に木の目隠しを追加。入口付近は開き、元の境界の幅内で立った目線を遮る。指定目線と他の床の立つ空間を保持。対戦バランスは未評価。' };
  return { ...stage, objects: [...original, ...added], design_rationale: rationale };
}

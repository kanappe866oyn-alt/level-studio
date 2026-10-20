import { buildingKit, scaledBuildingEntry } from './buildingKit.js';
import { boxesOverlap, getCollisionParts, isWalkable, surfaceTop, worldXZ, localXZ, WALKING } from './spatialGeometry.js';
import { segmentHitsBox, spatialEyeSamples } from './spatialSightlines.js';
import { TERRAIN_DISTRICTS } from './terrainMaterials.js';

export const isBuildingCanopy = o => o.spatialAppearance?.moduleId === 'building_canopy';

// Facade-sized pergolas connect the native building to its shared forecourt.
// Native ramps and canopies are measured, rather than inferred from a GLB box.
export function buildingCanopyParts(model, area, minimumClearance = 0) {
  const entry = scaledBuildingEntry(model), kit = buildingKit(model.variant);
  const bottom = model.pos[1] - model.size[1] / 2;
  const width = model.size[0] - 0.7, back = entry.front + 0.2, front = entry.ramp.near - 0.25;
  const nativeCanopy = kit.parts['Entrance canopy'];
  const nativeTop = nativeCanopy ? nativeCanopy.max[1] * model.size[1] / kit.size[1] : 0;
  const clearance = Math.max(2.8, entry.overhangBottom + 0.4, nativeTop + 0.2, minimumClearance);
  const district = area.level > 0 ? 'high' : area.enclosure === 'walled' ? 'lane' : area.kind === 'entry' ? 'entry' : area.kind === 'courtyard' ? 'court' : 'neutral';
  const palette = TERRAIN_DISTRICTS[district], parts = [];
  const add = (suffix, x, y, z, size, surface, color) => {
    const [wx, wz] = worldXZ(model, x, z);
    parts.push({ id: `${model.id}_canopy_${suffix}`, name: `${area.name}沿いの建物の庇`, role: 'wall', type: 'box', variant: 1, material: 0,
      pos: [wx, bottom + y, wz], size, rot: [...model.rot], color,
      spatialAppearance: { version: 1, style: 'harbor', surface, district, category: 'support', moduleId: 'building_canopy', areaId: area.id } });
  };
  const postX = width / 2 - 0.25, postZ = front - 0.12;
  for (const side of [-1, 1]) {
    add(`foot_${side}`, side * postX, 0.14, postZ, [0.42, 0.28, 0.42], 'brick', palette.foot);
    add(`post_${side}`, side * postX, clearance / 2, postZ, [0.18, clearance, 0.18], 'metal', palette.crown);
  }
  for (const [name, z] of [['back', back], ['front', postZ]]) add(`beam_${name}`, 0, clearance + 0.1, z, [width, 0.2, 0.18], 'wood', palette.crown);
  const slats = Math.max(5, Math.ceil(width / 0.85));
  for (let i = 0; i <= slats; i++) add(`rafter_${i}`, -width / 2 + width * i / slats, clearance + 0.26, (back + front) / 2,
    [0.12, 0.12, front - back + 0.32], 'wood', palette.crown);
  add('roof', 0, clearance + 0.37, (back + front) / 2, [width + 0.2, 0.1, front - back + 0.32], 'wood', district === 'high' ? '#477f7c' : '#ac7955');
  return parts;
}

// Connect only complete accepted frontage frames. The measured native bounds
// align their entrance edges even when neighbouring buildings have different sizes.
export function buildingCanopyLink(left, right, index) {
  const roof = m => m.parts.find(p => p.id.endsWith('_canopy_roof'));
  const a = roof(left), b = roof(right), [dx, dz] = localXZ(a, b.pos[0], b.pos[2]);
  const gap = dx - (a.size[0] + b.size[0]) / 2;
  const near = Math.max(-a.size[2] / 2, dz - b.size[2] / 2), far = Math.min(a.size[2] / 2, dz + b.size[2] / 2);
  if (gap <= 0.05 || gap > 4 || far - near < 0.5 || Math.abs(a.pos[1] - b.pos[1]) > 0.01) return [];
  const x = a.size[0] / 2 + gap / 2, parts = [];
  const add = (suffix, y, z, size, template = a, turn = 0) => {
    const [wx, wz] = worldXZ(a, x, z);
    parts.push({ ...template, id: `${left.model.id}_canopy_join_${index}_${suffix}`, name: '建物をつなぐ回廊の屋根と梁',
      pos: [wx, y, wz], size, rot: [0, a.rot[1] + turn, 0] });
  };
  add('roof', a.pos[1], (near + far) / 2, [gap, 0.1, far - near]);
  for (const side of ['back', 'front']) {
    const beam = left.parts.find(p => p.id.endsWith(`_canopy_beam_${side}`));
    const other = right.parts.find(p => p.id.endsWith(`_canopy_beam_${side}`));
    const [, z] = localXZ(a, beam.pos[0], beam.pos[2]);
    const [, otherZ] = localXZ(a, other.pos[0], other.pos[2]);
    add(`beam_${side}`, beam.pos[1], (z + otherZ) / 2, [Math.hypot(gap + 0.2, otherZ - z), beam.size[1], beam.size[2]], beam, -Math.atan2(otherZ - z, gap + 0.2));
  }
  return parts;
}

export function placeBuildingCanopies(stage) {
  const original = stage.objects.filter(o => !isBuildingCanopy(o)), solids = original.flatMap(getCollisionParts);
  const rays = [];
  for (const s of stage.plan.requirements.sightlines) {
    const a = stage.areas.find(a => a.id === s.from), b = stage.areas.find(a => a.id === s.to);
    for (const p of spatialEyeSamples(a)) for (const q of spatialEyeSamples(b)) if (!solids.some(o => segmentHitsBox(p, q, o))) rays.push([p, q]);
  }
  const added = [], groups = [], rejected = [], frames = [], links = [];
  const models = original.filter(o => o.buildingPlacement && !o.customModelUrl);
  const clearances = new Map();
  for (const model of models) {
    const area = stage.areas.find(a => a.id === model.buildingPlacement.from);
    if (!area) continue;
    const beam = buildingCanopyParts(model, area).find(p => p.id.endsWith('_canopy_beam_front'));
    const height = beam.pos[1] - 0.1 - (model.pos[1] - model.size[1] / 2);
    clearances.set(model.buildingPlacement.plotId, Math.max(clearances.get(model.buildingPlacement.plotId) || 0, height));
  }
  for (const model of models) {
    const area = stage.areas.find(a => a.id === model.buildingPlacement.from);
    const pad = original.find(o => o.id === `sp_build_${model.buildingPlacement.plotId}_pad`);
    if (!area || !pad) continue;
    const parts = buildingCanopyParts(model, area, clearances.get(model.buildingPlacement.plotId)), feet = parts.filter(p => p.id.includes('_canopy_foot_'));
    const y = model.pos[1] - model.size[1] / 2;
    const standing = solids.filter(o => isWalkable(o) && ![pad.id, 'sp_ground', 'sp_terrain_surround'].includes(o.id)).map(o => ({
      ...o, pos: [o.pos[0], o.pos[1] + o.size[1] / 2 + WALKING.height / 2, o.pos[2]], size: [o.size[0] + WALKING.radius * 2, WALKING.height, o.size[2] + WALKING.radius * 2] }));
    // The native overhang collider deliberately fills the entire upper frontage
    // (including empty air). A facade attachment may share that reserved volume;
    // keep the actual building body and every neighbouring collider protected.
    const obstacles = solids.filter(o => !isWalkable(o) && o.id !== `${model.id}_overhang`);
    const supported = feet.every(p => [-0.5, 0.5].every(dx => [-0.5, 0.5].every(dz => {
      const [x, z] = worldXZ(p, dx * p.size[0], dz * p.size[2]);
      const top = surfaceTop(pad, x, z); return top !== null && Math.abs(top - y) < 0.015;
    })));
    const reason = parts.some(p => original.some(o => o.id === p.id)) ? 'identifier' : !supported ? 'support' :
      parts.some(p => [...obstacles, ...standing, ...added].some(o => boxesOverlap(p, o))) ? 'clearance' :
      parts.some(p => rays.some(([a, b]) => segmentHitsBox(a, b, p))) ? 'sight' : null;
    if (reason) { rejected.push({ id: model.id, reason }); continue; }
    added.push(...parts); groups.push({ id: model.id, parts: parts.length, clearance: parts.find(p => p.id.endsWith('_beam_front')).pos[1] - 0.1 - y });
    frames.push({ model, parts, pad });
  }
  for (const plotId of new Set(frames.map(f => f.model.buildingPlacement.plotId))) {
    const row = frames.filter(f => f.model.buildingPlacement.plotId === plotId).sort((a, b) =>
      localXZ(a.pad, a.model.pos[0], a.model.pos[2])[0] - localXZ(b.pad, b.model.pos[0], b.model.pos[2])[0]);
    for (let i = 1; i < row.length; i++) {
      const left = row[i - 1], right = row[i], parts = buildingCanopyLink(left, right, i);
      if (!parts.length) continue;
      const own = new Set([...left.parts, ...right.parts].map(p => p.id));
      // The two attachment ends share their parents' conservative overhang
      // envelopes, just like the frontage frames. Keep both solid bodies and
      // every third-party building or manually placed obstacle protected.
      const parentOverhangs = new Set([`${left.model.id}_overhang`, `${right.model.id}_overhang`]);
      const obstacles = [...solids, ...added].filter(o => !own.has(o.id) && !parentOverhangs.has(o.id) && !isWalkable(o));
      const standing = solids.filter(o => isWalkable(o) && !['sp_ground', 'sp_terrain_surround'].includes(o.id)).map(o => ({
        ...o, pos: [o.pos[0], o.pos[1] + o.size[1] / 2 + WALKING.height / 2, o.pos[2]], size: [o.size[0], WALKING.height, o.size[2]] }));
      const reason = parts.some(p => original.some(o => o.id === p.id)) ? 'identifier' :
        parts.some(p => [...obstacles, ...standing].some(o => boxesOverlap(p, o))) ? 'clearance' :
        parts.some(p => rays.some(([a, b]) => segmentHitsBox(a, b, p))) ? 'sight' : null;
      if (reason) { rejected.push({ id: `${plotId}:join:${i}`, reason }); continue; }
      added.push(...parts); links.push({ from: left.model.id, to: right.model.id, parts: parts.length });
    }
  }
  const rationale = structuredClone(stage.design_rationale);
  rationale.spatial_design.building_canopies = { version: 2, groups, links, rejected, addedObjects: added.length, clearEyePairsPreserved: rays.length };
  return { ...stage, objects: [...original, ...added], design_rationale: rationale };
}

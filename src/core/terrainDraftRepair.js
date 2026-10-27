import ASSETS from '../assets.json' with { type: 'json' };
import { getModelDefault } from './modelCatalog.js';
import { compileTerrainDesign } from './terrainDesign.js';
import { requestedDirectionalPlazas } from './terrainRequirements.js';
import { sampleTerrainRelief } from './terrainRelief.js';

// Retain only the explicitly authored, unique terrain domain within one
// generation attempt. Never infer a domain from a template or a bounding box.
// When the response omits the ground entirely, the only other source is the
// width and depth the user wrote in the request (already checked against the
// request text by the brief validation), centred on the origin.
export function retainTerrainDomain(draft, previousGround, brief = null) {
  const grounds=Array.isArray(draft?.objects)?draft.objects.filter(o=>o?.role==='ground'):[];
  const eligible=g=>g && g.id && g.pos?.length===3 && g.pos.every(Number.isFinite)
    && g.size?.length===3 && g.size.every(v=>Number.isFinite(v)&&v>0)
    && g.size[0]>=4 && g.size[0]<=120 && g.size[2]>=4 && g.size[2]<=120
    && (!g.rot || g.rot.length===3 && g.rot.every(v=>v===0));
  const none={draft,ground:null,change:null};
  // The ground size the user wrote, as validated by the brief. Works for a flat
  // request (terrain design disabled) as well as a relief one.
  const fromRequest=()=>{
    const stated=kind=>(brief?.requirements||[]).find(r=>r.kind===kind&&r.role==='ground'&&r.comparison==='exact')?.value;
    let width=stated('groundWidth'),depth=stated('groundDepth'),source='request';
    // No size in the request: use the one the model itself states in the same response (a required
    // field of its design rationale). The user's own numbers always come first.
    if(!Number.isFinite(width)||!Number.isFinite(depth)){
      const size=draft?.design_rationale?.ground_size;
      if(Array.isArray(size)&&size.length===2&&size.every(Number.isFinite)){width=size[0];depth=size[1];source='rationale';}
    }
    if(!Array.isArray(draft.objects)||!Number.isFinite(width)||!Number.isFinite(depth)||width<4||width>120||depth<4||depth>120||draft.objects.some(o=>o?.id==='ground_from_request')) return none;
    const ground={id:'ground_from_request',name:'Ground',type:'box',role:'ground',pos:[0,-0.05,0],size:[width,0.1,depth],rot:[0,0,0],color:'#6B8E23'};
    return {draft:{...draft,objects:[ground,...draft.objects]},ground:structuredClone(ground),change:{kind:source==='request'?'terrainDomainFromRequest':'terrainDomainFromRationale',objectId:ground.id,reason:source==='request'?`応答に地面がなかったため、指示に明示された幅${width}m・奥行${depth}mで原点中心に作成`:`応答に地面がなく指示にも広さがないため、応答の設計理由にあるground_size(${width}m×${depth}m)で原点中心に作成`}};
  };
  if(draft?.terrainDesign?.enabled!==true) return draft?.terrainDesign&&typeof draft.terrainDesign==='object'&&!grounds.length?fromRequest():none;
  if(grounds.length) return {draft,ground:grounds.length===1 && eligible(grounds[0])?structuredClone(grounds[0]):null,change:null};
  if(!eligible(previousGround)||!Array.isArray(draft.objects)||draft.objects.some(o=>o?.id===previousGround.id)) return fromRequest();
  const ground=structuredClone(previousGround);
  return {draft:{...draft,objects:[ground,...draft.objects]},ground:structuredClone(ground),change:{kind:'retainedTerrainDomain',objectId:ground.id,reason:'修正応答で省略された、同じ生成内の地面の位置と寸法を保持'}};
}

// Models often place a plaza or road end a few metres past the ground edge.
// Move such features back inside by the smallest amount; larger errors are left
// for the normal validation and regeneration. Sizes and heights never change.
const MAX_SHIFT = 4;
export function fitTerrainDesignToGround(draft) {
  const design = draft?.terrainDesign;
  const grounds = Array.isArray(draft?.objects) ? draft.objects.filter(o => o?.role === 'ground') : [];
  if (design?.enabled !== true || grounds.length !== 1) return { draft, changes: [] };
  const { pos, size } = grounds[0];
  if (!pos?.length || !size?.length || !pos.every(Number.isFinite) || !size.every(Number.isFinite)) return { draft, changes: [] };
  const next = structuredClone(design), changes = [];
  const box = { minX: pos[0] - size[0] / 2, maxX: pos[0] + size[0] / 2, minZ: pos[2] - size[2] / 2, maxZ: pos[2] + size[2] / 2 };
  const inside = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const move = (item, key, lo, hi, label) => {
    if (!Number.isFinite(item[key]) || lo > hi) return;
    const to = inside(item[key], lo, hi), shift = Math.abs(to - item[key]);
    if (shift === 0 || shift > MAX_SHIFT) return;
    changes.push({ kind: 'terrainFeatureFitted', reason: `${label}が地面の外にはみ出したため、大きさと高さを保ち${shift.toFixed(1)}m内側へ移動`, axis: key, before: item[key], after: to });
    item[key] = to;
  };
  for (const [index, pad] of (next.pads || []).entries()) {
    if (!Number.isFinite(pad.width) || !Number.isFinite(pad.depth)) continue;
    move(pad, 'x', box.minX + pad.width / 2, box.maxX - pad.width / 2, `平場${index + 1}`);
    move(pad, 'z', box.minZ + pad.depth / 2, box.maxZ - pad.depth / 2, `平場${index + 1}`);
  }
  for (const [index, path] of (next.paths || []).entries()) {
    const margin = Number.isFinite(path.width) ? path.width / 2 : 0;
    for (const point of path.points || []) {
      move(point, 'x', box.minX + margin, box.maxX - margin, `道${index + 1}の端点`);
      move(point, 'z', box.minZ + margin, box.maxZ - margin, `道${index + 1}の端点`);
    }
  }
  for (const [index, hill] of (next.hills || []).entries()) {
    move(hill, 'x', box.minX, box.maxX, `丘${index + 1}`);
    move(hill, 'z', box.minZ, box.maxZ, `丘${index + 1}`);
  }
  for (const [index, ridge] of (next.ridges || []).entries()) for (const point of ridge.points || []) {
    move(point, 'x', box.minX, box.maxX, `尾根${index + 1}の点`);
    move(point, 'z', box.minZ, box.maxZ, `尾根${index + 1}の点`);
  }
  return changes.length ? { draft: { ...draft, terrainDesign: next }, changes } : { draft, changes: [] };
}

// A tree, rock, plant, prop (a bench), rock wall or tower standing on a road blocks it (the walk check uses the
// real model box). Slide such decorations aside to the nearest free spot; their kind
// and count never change. A decoration that cannot be placed within 24 m is left
// for validation. Clearance is measured from the real footprint (the model's size, turned
// by its yaw), not from a circle around it: a wide tree beside a narrow road is not on it.
export function clearRoadsOfDecoration(draft) {
  const design = draft?.terrainDesign, objects = draft?.objects;
  const ground = Array.isArray(objects) ? objects.filter(o => o?.role === 'ground') : [];
  if (design?.enabled !== true || ground.length !== 1 || !Array.isArray(design.paths) || !design.paths.length) return { draft, changes: [] };
  const [gx, , gz] = ground[0].pos, [gw, , gd] = ground[0].size;
  if (![gx, gz, gw, gd].every(Number.isFinite)) return { draft, changes: [] };
  const half = o => {
    const model = getModelDefault(o.role, Number.isFinite(o.variant) ? o.variant : 1), size = (o.modelDimensions ? o.size : model?.size) || o.size || [0, 0, 0], yaw = Array.isArray(o.rot) && Number.isFinite(o.rot[1]) ? o.rot[1] : 0;
    return { hx: (Math.abs(Math.cos(yaw)) * size[0] + Math.abs(Math.sin(yaw)) * size[2]) / 2, hz: (Math.abs(Math.sin(yaw)) * size[0] + Math.abs(Math.cos(yaw)) * size[2]) / 2 };
  };
  // Distance from a footprint rectangle to a road segment, sampled along the segment.
  const gap = (x, z, h, a, b) => {
    const length = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.max(1, Math.ceil(length / 0.25));
    let best = Infinity;
    for (let k = 0; k <= steps; k++) {
      const px = a.x + (b.x - a.x) * k / steps, pz = a.z + (b.z - a.z) * k / steps;
      best = Math.min(best, Math.hypot(Math.max(0, Math.abs(px - x) - h.hx), Math.max(0, Math.abs(pz - z) - h.hz)));
    }
    return best;
  };
  const onRoad = (x, z, h) => design.paths.some(path => path.points.slice(1).some((point, k) => gap(x, z, h, path.points[k], point) < path.width / 2 + 0.35));
  const decorations = objects.filter(o => ['tree', 'rock', 'plant', 'prop', 'cliff', 'tower'].includes(o?.role) && Array.isArray(o.pos) && o.pos.every(Number.isFinite));
  const solids = objects.filter(o => ['building', 'tower', 'wall'].includes(o?.role) && Array.isArray(o.pos) && Array.isArray(o.size) && o.pos.every(Number.isFinite)).map(o => ({ x: o.pos[0], z: o.pos[2], ...half(o) }));
  const next = structuredClone(objects), changes = [];
  const moved = new Map();
  const directions = Array.from({ length: 16 }, (_, k) => [Math.cos(k * Math.PI / 8), Math.sin(k * Math.PI / 8)]);
  for (const o of decorations) {
    const h = half(o);
    if (!h.hx || !onRoad(o.pos[0], o.pos[2], h)) continue;
    const others = decorations.filter(p => p !== o).map(p => { const at = moved.get(p.id); return { x: at ? at[0] : p.pos[0], z: at ? at[1] : p.pos[2], ...half(p) }; });
    const apart = (x, z, q) => Math.abs(x - q.x) < (h.hx + q.hx) * 0.8 && Math.abs(z - q.z) < (h.hz + q.hz) * 0.8;
    search: for (let step = 1; step <= 24; step++) for (const [dx, dz] of directions) {
      const x = +(o.pos[0] + dx * step).toFixed(2), z = +(o.pos[2] + dz * step).toFixed(2);
      if (Math.abs(x - gx) > gw / 2 - h.hx - 0.5 || Math.abs(z - gz) > gd / 2 - h.hz - 0.5 || onRoad(x, z, h)) continue;
      if (others.some(q => apart(x, z, q)) || solids.some(q => Math.abs(x - q.x) < h.hx + q.hx + 0.5 && Math.abs(z - q.z) < h.hz + q.hz + 0.5)) continue;
      moved.set(o.id, [x, z]);
      const copy = next.find(item => item.id === o.id);
      copy.pos = [x, o.pos[1], z];
      changes.push({ kind: 'decorationMovedOffRoad', objectId: o.id, reason: `${o.id}が道を塞ぐため、同じ種類のまま${step}m離れた空きへ移動`, distance: step });
      break search;
    }
  }
  return changes.length ? { draft: { ...draft, objects: next }, changes } : { draft, changes: [] };
}

// A flat request builds no generated terrain, yet a model may still point its
// objects at "__generated_terrain". With exactly one ground, that ground is the
// floor it meant; pointing there changes nothing else.
export function redirectMissingTerrainSupport(draft) {
  const objects = draft?.objects;
  if (!Array.isArray(objects)) return { draft, changes: [] };
  const grounds = objects.filter(o => o?.role === 'ground');
  // With a terrain design the ground's walking surface is the generated terrain (the ground box itself is moved
  // under it), so a thing set on the ground stands on that terrain, as building plots already read it.
  if (draft?.terrainDesign?.enabled === true) {
    const onGround = grounds.length === 1 ? objects.filter(o => o && o !== grounds[0] && o.supportId === grounds[0].id) : [];
    if (!onGround.length) return { draft, changes: [] };
    return { draft: { ...draft, objects: objects.map(o => onGround.includes(o) ? { ...o, supportId: '__generated_terrain' } : o) }, changes: onGround.map(o => ({ kind: 'groundSupportToTerrain', objectId: o.id, reason: `${o.id}の接地先が地面${grounds[0].id}だったため、その地面の表面である生成地形へ付け替え` })) };
  }
  const stale = objects.filter(o => o?.supportId === '__generated_terrain');
  if (grounds.length !== 1 || !stale.length) return { draft, changes: [] };
  const next = objects.map(o => o?.supportId === '__generated_terrain' ? { ...o, supportId: grounds[0].id } : o);
  return { draft: { ...draft, objects: next }, changes: stale.map(o => ({ kind: 'supportRedirectedToGround', objectId: o.id, reason: `${o.id}の接地先が、平らな指示では作られない生成地形だったため、地面${grounds[0].id}へ付け替え` })) };
}

// Something that stands on the ground (a tree, a rock, a prop) whose supportId names a thing that cannot be stood
// on (a cliff wall, a wall) or does not exist: in a terrain design it stands on the generated terrain, which is
// where it was placed. Only ground-standing things are moved, and only the support is named again.
const STANDABLE = new Set(['platform', 'bridge', 'corridor', 'ground', 'landform', 'terrain', 'moving_platform', 'fragile']);
export function redirectDeadTerrainSupports(draft) {
  const objects = draft?.objects;
  if (draft?.terrainDesign?.enabled !== true || !Array.isArray(objects)) return { draft, changes: [] };
  const byId = new Map(objects.filter(o => o?.id).map(o => [o.id, o]));
  const changes = [];
  const next = objects.map(o => {
    if (!o?.supportId || o.supportId === '__generated_terrain' || !ASSETS.SEMANTIC_PREFABS[o.role]?.groundSnap) return o;
    const support = byId.get(o.supportId);
    if (support && STANDABLE.has(support.role)) return o;
    changes.push({ kind: 'deadSupportToTerrain', objectId: o.id, before: o.supportId, after: '__generated_terrain', reason: `${o.id}の接地先${o.supportId}は${support ? `立てる床(${support.role})ではない` : '存在しない'}ため、生成された地形へ付け替えた` });
    return { ...o, supportId: '__generated_terrain' };
  });
  return changes.length ? { draft: { ...draft, objects: next }, changes } : { draft, changes: [] };
}

// A model sometimes writes a landform profile value just past what the editor
// accepts (edgeRoughness 0.2 where the limit is 0.12). Pulling it to the limit
// keeps the intent (rough / strong relief) and the profile stays valid.
const PROFILE_LIMITS = { relief: [0, 1.2], edgeRoughness: [0, 0.12], grade: [0, 8], outerInset: [0, 0.24], cliffRelief: [0, 0.45] };
export function clampTerrainProfiles(draft) {
  const objects = draft?.objects;
  if (!Array.isArray(objects)) return { draft, changes: [] };
  const changes = [];
  const next = objects.map(o => {
    // A profile on something that is not a landform, with no relief and no roughness (a platform written with
    // the landform fields filled in as zeros), says nothing: it is taken off. A profile that asks for relief is left to be refused.
    if (o?.role && o.role !== 'landform' && o.terrainProfile && typeof o.terrainProfile === 'object' && !o.terrainProfile.surfaceGrid && !o.terrainProfile.relief && !o.terrainProfile.edgeRoughness && !o.terrainProfile.cliffRelief) {
      const rest = { ...o };
      delete rest.terrainProfile;
      changes.push({ kind: 'emptyTerrainProfileDropped', objectId: o.id, reason: `${o.id}はlandformではなく、地形設定(起伏0・粗さ0)に意味がないため取り除いた` });
      return rest;
    }
    const profile = o?.role === 'landform' && o.terrainProfile && typeof o.terrainProfile === 'object' ? o.terrainProfile : null;
    if (!profile) return o;
    const fixed = { ...profile };
    for (const [key, [low, high]] of Object.entries(PROFILE_LIMITS)) {
      if (Number.isFinite(fixed[key]) && (fixed[key] < low || fixed[key] > high)) {
        const to = Math.min(high, Math.max(low, fixed[key]));
        changes.push({ kind: 'terrainProfileClamped', objectId: o.id, reason: `${o.id}の${key}=${fixed[key]}が許容範囲(${low}〜${high})を超えたため${to}へ調整`, before: fixed[key], after: to });
        fixed[key] = to;
      }
    }
    if (Number.isFinite(fixed.seed) && (!Number.isInteger(fixed.seed) || fixed.seed < 0 || fixed.seed > 65535)) {
      const to = Math.min(65535, Math.max(0, Math.round(fixed.seed)));
      changes.push({ kind: 'terrainProfileClamped', objectId: o.id, reason: `${o.id}のseed=${fixed.seed}を整数の範囲(0〜65535)へ調整`, before: fixed.seed, after: to });
      fixed.seed = to;
    }
    return fixed.seed === profile.seed && Object.keys(PROFILE_LIMITS).every(k => fixed[k] === profile[k]) ? o : { ...o, terrainProfile: fixed };
  });
  return changes.length ? { draft: { ...draft, objects: next }, changes } : { draft, changes: [] };
}

// A road may climb at most 1 in 3. When the model drew it too short for its rise,
// extend the free (non-plaza) end along its own last direction, inside the ground.
// The rise is unchanged; the run grows. If it cannot be extended enough, nothing changes.
export function lengthenSteepRoads(draft) {
  const design = draft?.terrainDesign, ground = Array.isArray(draft?.objects) ? draft.objects.filter(o => o?.role === 'ground') : [];
  if (design?.enabled !== true || ground.length !== 1 || !Array.isArray(design.paths) || !Array.isArray(design.pads)) return { draft, changes: [] };
  const [gx, , gz] = ground[0].pos, [gw, , gd] = ground[0].size;
  if (![gx, gz, gw, gd].every(Number.isFinite)) return { draft, changes: [] };
  const inPad = q => design.pads.some(p => Math.abs(q.x - p.x) <= p.width / 2 && Math.abs(q.z - p.z) <= p.depth / 2);
  const next = structuredClone(design), changes = [];
  for (const [index, path] of next.paths.entries()) {
    const pts = path.points;
    if (!Array.isArray(pts) || pts.length < 2 || !pts.every(q => [q.x, q.z, q.height].every(Number.isFinite))) continue;
    const rise = Math.abs(pts.at(-1).height - pts[0].height);
    // Only the road outside the plazas (and their 0.8 m flat edge) can climb: the part that runs on into a plaza does not count.
    const onPad = q => design.pads.some(p => Math.abs(q.x - p.x) <= p.width / 2 + HARD_ZONE && Math.abs(q.z - p.z) <= p.depth / 2 + HARD_ZONE);
    let length = 0;
    for (let k = 1; k < pts.length; k++) {
      const segment = Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z), steps = Math.max(1, Math.ceil(segment / 0.1));
      for (let s = 0; s < steps; s++) if (!onPad({ x: pts[k - 1].x + (pts[k].x - pts[k - 1].x) * (s + 0.5) / steps, z: pts[k - 1].z + (pts[k].z - pts[k - 1].z) * (s + 0.5) / steps })) length += segment / steps;
    }
    const needed = 3.05 * rise + 0.3;
    if (rise < 0.5 || length >= needed) continue;
    // Extend the lower end if it is free of plazas; otherwise the other free end.
    const ends = [{ at: 0, point: pts[0], from: pts[1] }, { at: pts.length - 1, point: pts.at(-1), from: pts.at(-2) }].filter(e => !inPad(e.point)).sort((a, b) => a.point.height - b.point.height);
    const end = ends[0];
    if (!end) continue;
    const dx = end.point.x - end.from.x, dz = end.point.z - end.from.z, step = Math.hypot(dx, dz);
    if (!step) continue;
    const margin = path.width / 2, deficit = needed - length;
    const room = t => Math.abs(end.point.x + dx / step * t - gx) <= gw / 2 - margin && Math.abs(end.point.z + dz / step * t - gz) <= gd / 2 - margin;
    if (!room(deficit)) continue;
    const moved = { ...end.point, x: end.point.x + dx / step * deficit, z: end.point.z + dz / step * deficit };
    pts[end.at] = moved;
    changes.push({ kind: 'steepRoadLengthened', reason: `道${index + 1}が高低差${rise.toFixed(1)}mに対して短い(${length.toFixed(1)}m)ため、平場に入っていない端を同じ向きに${deficit.toFixed(1)}m延長(高さは変更なし)`, pathIndex: index, extended: deficit });
  }
  return changes.length ? { draft: { ...draft, terrainDesign: next }, changes } : { draft, changes: [] };
}

// A road that stops a few metres short of a plaza it is meant to reach (a ramp up to a cliff-top plateau
// that ends at the foot of the cliff) leaves the road at one height beside a plaza at another. The
// terrain design asks for a road to end inside the plaza, so the end is carried into it, at the
// plaza's height; the climb in between is then the ordinary one (lengthened if it is too steep).
// Only for an end within 4 m of the plaza, for a road whose heights the request does not fix, and
// only when the heights differ by more than 1 m. Each end moved is recorded with its values before and after.
export function connectRoadEndsToPads(draft, brief = null) {
  const design = draft?.terrainDesign;
  if (design?.enabled !== true || !Array.isArray(design.paths) || !Array.isArray(design.pads) || !design.pads.length) return { draft, changes: [] };
  if ((brief?.requirements || []).some(r => r.role === 'path' && r.kind !== 'count')) return { draft, changes: [] };
  const pads = design.pads.filter(p => [p.x, p.z, p.width, p.depth, p.height].every(Number.isFinite));
  const next = structuredClone(design), changes = [];
  for (const [index, path] of next.paths.entries()) {
    if (!Array.isArray(path.points) || path.points.length < 2 || !path.points.every(q => [q.x, q.z, q.height].every(Number.isFinite))) continue;
    for (const at of [0, path.points.length - 1]) {
      const q = path.points[at];
      if (pads.some(p => Math.abs(q.x - p.x) <= p.width / 2 && Math.abs(q.z - p.z) <= p.depth / 2)) continue;
      const near = pads.map(p => ({ p, d: Math.hypot(Math.max(0, Math.abs(q.x - p.x) - p.width / 2), Math.max(0, Math.abs(q.z - p.z) - p.depth / 2)) })).sort((a, b) => a.d - b.d)[0];
      if (!near || near.d > 4 || Math.abs(near.p.height - q.height) <= 1) continue;
      const { p } = near, x = Math.max(p.x - p.width / 2 + 0.5, Math.min(p.x + p.width / 2 - 0.5, q.x)), z = Math.max(p.z - p.depth / 2 + 0.5, Math.min(p.z + p.depth / 2 - 0.5, q.z));
      changes.push({ kind: 'roadEndCarriedIntoPad', pathIndex: index, pointIndex: at, before: { x: q.x, z: q.z, height: q.height }, after: { x, z, height: p.height },
        reason: `道${index + 1}の端(${q.x}, ${q.z})が平場から${near.d.toFixed(1)}mで止まり高さも違ったため、平場の中(${x}, ${z})・平場の高さ${p.height}mまで延ばした（他の点・道幅は変更なし）` });
      path.points[at] = { x, z, height: p.height };
    }
  }
  return changes.length ? { draft: { ...draft, terrainDesign: next }, changes } : { draft, changes: [] };
}

// A rock wall or cliff drawn as one more landform box over the generated terrain is a second ground laid over
// the first: it overlaps the terrain, trees and rocks get placed inside it, and its flat top is a floor nobody
// can reach. The model's own name for it says what it is (岩壁・崖・岩山・backdrop・cliff): it becomes a rock group
// of the design (cliff meshes standing on the ground), at the same place, as high and as wide. A landform the name
// does not call a rock wall is left as it is (and is reported later), not guessed at.
export function convertBackdropLandforms(draft) {
  const design = draft?.terrainDesign;
  if (design?.enabled !== true || !Array.isArray(draft?.objects)) return { draft, changes: [] };
  const named = o => o?.role === 'landform' && o.id !== '__generated_terrain' && Array.isArray(o.pos) && Array.isArray(o.size) && [...o.pos, ...o.size].every(Number.isFinite) &&
    o.size[1] >= 3 && /岩壁|崖|岩山|岩の塔|断崖|backdrop|cliff|rock/i.test(`${o.id} ${o.name || ''}`);
  const found = draft.objects.filter(named);
  if (!found.length) return { draft, changes: [] };
  const next = structuredClone(design);
  next.formations = Array.isArray(next.formations) ? next.formations : [];
  const changes = [];
  for (const o of found) {
    if (next.formations.length >= 6) break;
    const across = Math.max(o.size[0], o.size[2]);
    const entry = { x: o.pos[0], z: o.pos[2], count: Math.max(1, Math.round(across / 14)), height: Math.min(26, Math.max(4, o.size[1])), spread: Math.max(0, (across - 14) / 2) };
    next.formations.push(entry);
    changes.push({ kind: 'backdropLandformToFormation', objectId: o.id, before: { pos: o.pos, size: o.size }, after: entry,
      reason: `${o.id}は地形の上に重ねた岩壁の箱(landform)だったため、設計の岩の群れ(高さ${entry.height}m・${entry.count}個)に置き換えた(同じ位置)` });
  }
  const ids = new Set(changes.map(c => c.objectId));
  return { draft: { ...draft, objects: draft.objects.filter(o => !ids.has(o.id)), terrainDesign: next }, changes };
}

// A stair names the floors it joins. A name that is not a floor (the start marker, a wall, an ID that does not exist) says nothing
// about the floors; both names are cleared, and the connection is worked out from where the stair stands (stairLandings.js), as for
// a stair that named nothing. A stair whose two names are floors is left as the model wrote it.
export function clearInvalidStairFloors(draft) {
  if (draft?.terrainDesign?.enabled !== true || !Array.isArray(draft?.objects)) return { draft, changes: [] };
  const byId = new Map(draft.objects.filter(o => o?.id).map(o => [o.id, o]));
  const floor = id => id === '__generated_terrain' || (byId.has(id) && ['platform', 'bridge', 'corridor', 'ground', 'landform', 'terrain', 'moving_platform', 'fragile'].includes(byId.get(id).role));
  const changes = [];
  const objects = draft.objects.map(o => {
    if (o?.role !== 'climb' || o.variant === 2 || (!o.stairFrom && !o.stairTo) || (floor(o.stairFrom) && floor(o.stairTo))) return o;
    changes.push({ kind: 'stairFloorNamesCleared', objectId: o.id, before: { stairFrom: o.stairFrom, stairTo: o.stairTo }, reason: `${o.id}の接続先(${o.stairFrom || '-'}→${o.stairTo || '-'})のうち立てる床ではないものがあったため、名前を消し、階段の位置から接続を決め直す` });
    const rest = { ...o };
    delete rest.stairFrom; delete rest.stairTo;
    return rest;
  });
  return changes.length ? { draft: { ...draft, objects }, changes } : { draft, changes: [] };
}

// A rock wall (cliff) is one fixed model, 20 × 10 × 13 m: a cliff the model sized at 8 m comes out more than twice as wide, over the
// road and the plaza beside it. The cliff mesh scales (the editor's own backdrop cliffs are scaled), so the size the model wrote is kept:
// the object is marked as a scaled instance of the model.
export function keepCliffSizes(draft) {
  if (!Array.isArray(draft?.objects)) return { draft, changes: [] };
  const model = getModelDefault('cliff', 1);
  if (!model) return { draft, changes: [] };
  const changes = [];
  const objects = draft.objects.map(o => {
    if (o?.role !== 'cliff' || o.type === 'spline' || o.customModelUrl || o.modelDimensions || !Array.isArray(o.size) || o.size.some(v => !Number.isFinite(v) || v <= 0)) return o;
    changes.push({ kind: 'cliffSizeKept', objectId: o.id, reason: `${o.id}(岩壁)はモデルの大きさ(約20×10×13m)に置き換わるところだったため、書かれた大きさ${o.size.join('×')}mのまま使う` });
    return { ...o, modelDimensions: { path: model.path, size: [...model.bounds.size], defaultScale: model.scale } };
  });
  return changes.length ? { draft: { ...draft, objects }, changes } : { draft, changes: [] };
}

// A plateau written twice: as a terrain plaza (pad) and again as a platform box over the same ground
// at the same top height. The box is then seated on the terrain and stands a second storey above the
// plaza, out of reach of the road that climbs to the plaza. The terrain plaza is the plateau, so the
// duplicate box goes; what stood on it is pointed at the terrain. A platform that a stair names is kept, and so is a
// thin slab (a 20 cm top surface is not a second storey; a stair may be built up to it).
export function dropPlatformsDuplicatingPads(draft) {
  const design = draft?.terrainDesign;
  if (design?.enabled !== true || !Array.isArray(design.pads) || !design.pads.length || !Array.isArray(draft?.objects)) return { draft, changes: [] };
  const named = new Set(draft.objects.flatMap(o => [o?.stairFrom, o?.stairTo]).filter(Boolean));
  const same = o => o?.role === 'platform' && o.size?.[1] > 0.5 && Array.isArray(o.pos) && Array.isArray(o.size) && ![...o.pos, ...o.size].some(v => !Number.isFinite(v)) && !named.has(o.id) && !(o.rot || []).some((v, i) => i !== 1 && v) && design.pads.some(p =>
    Math.abs(o.pos[0] - p.x) <= 1 + Math.abs(p.width - o.size[0]) / 2 && Math.abs(o.pos[2] - p.z) <= 1 + Math.abs(p.depth - o.size[2]) / 2 &&
    Math.abs(o.size[0] - p.width) <= 2 && Math.abs(o.size[2] - p.depth) <= 2 && Math.abs(o.pos[1] + o.size[1] / 2 - p.height) <= 0.6);
  const dropped = draft.objects.filter(same);
  // A thin slab (paving) laid mostly over a plaza, standing on nothing, is that plaza's surface: it is
  // seated on the plaza (its colour kept) instead of hovering up to 0.6 m above it with a gap underneath.
  const share = (o, p) => { const yaw = o.rot?.[1] || 0, w = Math.abs(Math.cos(yaw)) * o.size[0] + Math.abs(Math.sin(yaw)) * o.size[2], d = Math.abs(Math.sin(yaw)) * o.size[0] + Math.abs(Math.cos(yaw)) * o.size[2];
    return Math.max(0, Math.min(o.pos[0] + w / 2, p.x + p.width / 2) - Math.max(o.pos[0] - w / 2, p.x - p.width / 2)) * Math.max(0, Math.min(o.pos[2] + d / 2, p.z + p.depth / 2) - Math.max(o.pos[2] - d / 2, p.z - p.depth / 2)) / (w * d || 1); };
  const hovering = draft.objects.filter(o => o?.role === 'platform' && !o.supportId && !o.designFeature && o.size?.[1] <= 0.5 && Array.isArray(o.pos) && Array.isArray(o.size) && ![...o.pos, ...o.size].some(v => !Number.isFinite(v)) && !named.has(o.id) && !(o.rot || []).some((v, i) => i !== 1 && v) && design.pads.some(p =>
    [p.x, p.z, p.width, p.depth, p.height].every(Number.isFinite) && share(o, p) >= 0.5 && o.pos[1] + o.size[1] / 2 - p.height > 0.15 && o.pos[1] + o.size[1] / 2 - p.height <= 0.6));
  if (!dropped.length && !hovering.length) return { draft, changes: [] };
  const ids = new Set(dropped.map(o => o.id)), seated = new Set(hovering.map(o => o.id));
  const objects = draft.objects.filter(o => !ids.has(o.id)).map(o => seated.has(o.id) ? Object.fromEntries(Object.entries({ ...o, supportId: '__generated_terrain' }).filter(([key]) => key !== 'surfaceY')) : ids.has(o?.supportId) ? { ...o, supportId: '__generated_terrain' } : o);
  return { draft: { ...draft, objects }, changes: [...dropped.map(o => ({ kind: 'platformDuplicatingPadDropped', objectId: o.id, reason: `${o.id}は同じ位置・高さの地形の平場と二重になる足場だったため、平場を台地として取り除いた` })),
    ...hovering.map(o => ({ kind: 'pavingSeatedOnPad', objectId: o.id, reason: `${o.id}は同じ大きさの地形の平場の上に浮いた薄い床だったため、平場の上面に敷いた（色・大きさは変更なし）` }))] };
}

// A stair the model drew on top of a terrain road that already climbs there says the same thing
// twice, and a stair with no floors named cannot be assembled. The road is the climb, so the
// duplicate is removed. A stair the request asks for (a count, width or height of a stair), or one
// that names its floors, is the user's or the model's deliberate choice and is never touched. The same goes
// for a stair the request, its goals or the reference image mention (a goal exists for a stair left unsaid by count).
export function dropStairsDuplicatingRoads(draft, brief = null) {
  const design = draft?.terrainDesign;
  if (design?.enabled !== true || !Array.isArray(design.paths) || !Array.isArray(draft?.objects)) return { draft, changes: [] };
  if ((brief?.requirements || []).some(r => r.role === 'climb' || r.targetRole === 'climb')) return { draft, changes: [] };
  // A stair that the request, its goals or the reference image names is a feature the user wants (a stone stair
  // up a cliff in the image): it is never taken for a duplicate of the road. Only a stair nobody asked for goes.
  const stairWanted = [...(brief?.imageObservations || []), ...(brief?.designGoals || []).map(g => g.description)].some(text => /階段|ステップ|stair/i.test(text));
  if (stairWanted) return { draft, changes: [] };
  const climbing = design.paths.filter(p => Array.isArray(p.points) && p.points.length >= 2 && p.points.every(q => [q.x, q.z, q.height].every(Number.isFinite)) && Math.abs(p.points.at(-1).height - p.points[0].height) >= 1);
  if (!climbing.length) return { draft, changes: [] };
  const distance = (x, z, path) => Math.min(...path.points.slice(1).map((b, i) => {
    const a = path.points[i], dx = b.x - a.x, dz = b.z - a.z, l = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l));
    return Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
  }));
  const dropped = [];
  const objects = draft.objects.filter(o => {
    if (o?.role !== 'climb' || o.variant === 2 || o.stairFrom || o.stairTo || !Array.isArray(o.pos) || !Array.isArray(o.size)) return true;
    const road = climbing.find(p => distance(o.pos[0], o.pos[2], p) <= (Number.isFinite(p.width) ? p.width : 4) / 2 + Math.max(o.size[0], o.size[2]) / 2);
    if (!road) return true;
    dropped.push(o);
    return false;
  });
  if (!dropped.length) return { draft, changes: [] };
  return { draft: { ...draft, objects }, changes: dropped.map(o => ({ kind: 'stairDuplicatingRoadDropped', objectId: o.id, reason: `${o.id}は上り坂の道に重なる階段で、上下の床も指定がなかったため、道を登り口として取り除いた` })) };
}

// A road that cannot climb from a plaza to its other end within 1 in 3 ("the slope cannot be kept to 1/3 while
// the plaza heights are held"): the model's plaza heights are its own design numbers, not the user's. When the
// request does not fix them, the plaza at the steep end is eased towards the road's other end by just what the
// run is short of (at most 3 m in all), instead of failing the whole design. A plaza the request gives a height
// for, one the terraces made, and one with an authored floor on it (a platform or stair at a stated height) are
// never touched. The change is adopted only if the terrain then compiles, and it is recorded before and after.
const SLOPE_FAILURE = /道(\d+): \((-?[\d.]+),(-?[\d.]+)\)標高(-?[\d.]+)m→\((-?[\d.]+),(-?[\d.]+)\)標高(-?[\d.]+)m、有効長([\d.]+)mに対し必要長([\d.]+)m/g;
export function easePadHeights(draft, brief = null) {
  const design = draft?.terrainDesign;
  if (design?.enabled !== true || !Array.isArray(design.pads) || !design.pads.length || !Array.isArray(design.paths)) return { draft, changes: [] };
  if ((brief?.requirements || []).some(r => r.kind === 'padElevation')) return { draft, changes: [] };
  let work = structuredClone(draft);
  const changes = [], moved = new Map(), roadChanges = [];
  const authoredFloor = pad => (work.objects || []).some(o => o?.role === 'platform' && (Number.isFinite(o.surfaceY) || !o.supportId) && Array.isArray(o.pos) && Array.isArray(o.size) && Math.abs(o.pos[0] - pad.x) <= pad.width / 2 && Math.abs(o.pos[2] - pad.z) <= pad.depth / 2);
  for (let round = 0; round < 4; round++) {
    let message;
    try { compileTerrainDesign(structuredClone(work)); break; } catch (error) { message = String(error?.message); }
    const failures = [...message.matchAll(SLOPE_FAILURE)];
    if (!failures.length) break;
    let touched = false;
    for (const f of failures) {
      const [ax, az, ah, bx, bz, bh, length, needed] = f.slice(2).map(Number);
      const shortBy = (needed - length) / 3 + 0.05;
      const padAt = (x, z) => work.terrainDesign.pads.map(p => ({ p, d: Math.hypot(Math.max(0, Math.abs(x - p.x) - p.width / 2), Math.max(0, Math.abs(z - p.z) - p.depth / 2)) })).filter(c => c.d <= 1.3).sort((u, v) => u.d - v.d)[0]?.p;
      const ends = [{ pad: padAt(ax, az), height: ah, other: bh }, { pad: padAt(bx, bz), height: bh, other: ah }].filter(e => e.pad && !e.pad.from && !authoredFloor(e.pad));
      if (!ends.length) continue;
      const share = shortBy / ends.length;
      for (const e of ends) {
        const origin = moved.get(e.pad) ?? { height: e.pad.height, total: 0 };
        const step = Math.sign(e.other - e.height) * Math.min(share, 3 - origin.total);
        if (!step) continue;
        e.pad.height = +(e.pad.height + step).toFixed(2);
        moved.set(e.pad, { height: origin.height, total: origin.total + Math.abs(step) });
        touched = true;
      }
    }
    if (!touched) break;
    // Moving a plaza can leave a road beside it at another height; the road is regraded around the plaza as usual.
    const regraded = regradeRoadsNearPads(work, brief);
    if (regraded.changes.length) { work = regraded.draft; roadChanges.push(...regraded.changes); }
  }
  try { compileTerrainDesign(structuredClone(work)); } catch { return { draft, changes: [] }; }
  for (const [pad, was] of moved) changes.push({ kind: 'padHeightEased', before: was.height, after: pad.height, reason: `平場(${pad.x}, ${pad.z})の高さを${was.height}m→${pad.height}mへ変更した。道が1/3以下の勾配で上れる長さが足りず、依頼に高さの指定がない平場の高さをその分だけ道の反対側へ寄せた` });
  return changes.length ? { draft: work, changes: [...changes, ...roadChanges] } : { draft, changes: [] };
}

// Two plazas at different heights whose surroundings meet give one spot two heights: the
// terrain fixes the ground within 0.8 m of every plaza, so the compile rejects it. When the
// plazas only just touch, pull the facing edges apart; a large overlap is a real design
// conflict and is left to the model.
const HARD_ZONE = 0.8, MAX_PAD_CUT = 6, MIN_PAD_SIDE = 5;

// Building plots: the model footprint plus the 1.2 m the terrain levels around it.
function buildingPlots(draft) {
  return (Array.isArray(draft?.objects) ? draft.objects : []).filter(o => o?.role === 'building' && Array.isArray(o.pos) && o.pos.every(Number.isFinite)).map(o => {
    const size = getModelDefault('building', Number.isFinite(o.variant) ? o.variant : 1)?.size || o.size || [10, 0, 10], yaw = Array.isArray(o.rot) && Number.isFinite(o.rot[1]) ? o.rot[1] : 0;
    return { x: o.pos[0], z: o.pos[2], w: Math.abs(Math.cos(yaw)) * size[0] + Math.abs(Math.sin(yaw)) * size[2] + 1.2, d: Math.abs(Math.sin(yaw)) * size[0] + Math.abs(Math.cos(yaw)) * size[2] + 1.2 };
  });
}
export function separateNearbyPads(draft) {
  const pads = draft?.terrainDesign?.pads;
  if (draft?.terrainDesign?.enabled !== true || !Array.isArray(pads) || pads.length < 2) return { draft, changes: [] };
  const next = structuredClone(draft.terrainDesign), list = next.pads, changes = [];
  const ok = p => [p.x, p.z, p.width, p.depth, p.height].every(Number.isFinite);
  const plots = buildingPlots(draft);
  // After a cut, the plaza must still hold every building plot that stands on it.
  const holds = (p, lo, hi, axis) => plots.filter(b => Math.abs(b.x - p.x) <= p.width / 2 && Math.abs(b.z - p.z) <= p.depth / 2).every(b => axis === 'x' ? b.x - b.w / 2 >= lo - 1e-6 && b.x + b.w / 2 <= hi + 1e-6 : b.z - b.d / 2 >= lo - 1e-6 && b.z + b.d / 2 <= hi + 1e-6);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (!ok(a) || !ok(b) || Math.abs(a.height - b.height) <= 0.35) continue;
    const ox = Math.min(a.x + a.width / 2, b.x + b.width / 2) - Math.max(a.x - a.width / 2, b.x - b.width / 2) + 2 * HARD_ZONE;
    const oz = Math.min(a.z + a.depth / 2, b.z + b.depth / 2) - Math.max(a.z - a.depth / 2, b.z - b.depth / 2) + 2 * HARD_ZONE;
    if (ox <= 0 || oz <= 0) continue;
    const axis = ox <= oz ? 'x' : 'z', length = axis === 'x' ? 'width' : 'depth', need = Math.min(ox, oz) + 0.1, direction = Math.sign(b[axis] - a[axis]) || 1;
    // Cut `from` the facing edge of each plaza; try an even split first, then shift the cut to the plaza with room.
    const range = (p, cut, side) => { const lo = p[axis] - p[length] / 2 + (side < 0 ? cut : 0), hi = p[axis] + p[length] / 2 - (side > 0 ? cut : 0); return [lo, hi]; };
    let chosen = null;
    for (let step = 0; step <= 40 && !chosen; step++) for (const shift of step ? [step * 0.1, -step * 0.1] : [0]) {
      const cutA = need / 2 + shift, cutB = need - cutA;
      if (cutA < 0 || cutB < 0 || cutA > MAX_PAD_CUT || cutB > MAX_PAD_CUT || a[length] - cutA < MIN_PAD_SIDE || b[length] - cutB < MIN_PAD_SIDE) continue;
      const [aLo, aHi] = range(a, cutA, direction), [bLo, bHi] = range(b, cutB, -direction);
      if (holds(a, aLo, aHi, axis) && holds(b, bLo, bHi, axis)) { chosen = { cutA, cutB }; break; }
    }
    if (!chosen) continue;
    a[length] -= chosen.cutA; a[axis] -= direction * chosen.cutA / 2; b[length] -= chosen.cutB; b[axis] += direction * chosen.cutB / 2;
    changes.push({ kind: 'padsSeparated', reason: `高さの違う平場${i + 1}と${j + 1}が周囲0.8m以内で接していたため、向かい合う辺を${chosen.cutA.toFixed(1)}mと${chosen.cutB.toFixed(1)}m縮めて離した（高さと建物の足場は変更なし）`, axis, cutA: chosen.cutA, cutB: chosen.cutB });
  }
  return changes.length ? { draft: { ...draft, terrainDesign: next }, changes } : { draft, changes: [] };
}

// A plaza laid across a river holds the ground at its own height over the channel and dams the water (the river
// vanishes under a mound). The plaza is moved straight off the river, the shortest way, or else trimmed back from it;
// one that can do neither within the ground keeps its place and the terrain inspection still reports it.
export function movePadsOffRivers(draft) {
  const design = draft?.terrainDesign, ground = (Array.isArray(draft?.objects) ? draft.objects : []).find(o => o?.role === 'ground');
  if (design?.enabled !== true || !Array.isArray(design.pads) || !Array.isArray(design.rivers) || !design.rivers.length || !ground || ![...ground.pos, ...ground.size].every(Number.isFinite)) return { draft, changes: [] };
  const next = structuredClone(design), changes = [];
  const [gx, , gz] = ground.pos, [gw, , gd] = ground.size;
  const segments = next.rivers.flatMap(river => (river?.points || []).slice(1).map((b, k) => ({ a: river.points[k], b, half: Math.max(1.5, Math.min(7, river.width || 0) / 2) + 1 }))).filter(s => [s.a?.x, s.a?.z, s.b?.x, s.b?.z].every(Number.isFinite));
  // Distance from a segment to a rectangle, by sampling the rectangle 1 m apart (rivers are a few metres wide).
  const wet = p => segments.some(s => { const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, len2 = dx * dx + dz * dz || 1;
    for (let u = 0; u <= Math.ceil(p.width); u++) for (let v = 0; v <= Math.ceil(p.depth); v++) {
      const x = p.x - p.width / 2 + p.width * u / Math.ceil(p.width), z = p.z - p.depth / 2 + p.depth * v / Math.ceil(p.depth), t = Math.max(0, Math.min(1, ((x - s.a.x) * dx + (z - s.a.z) * dz) / len2));
      if (Math.hypot(x - s.a.x - t * dx, z - s.a.z - t * dz) < s.half) return true;
    }
    return false; });
  const inside = p => Math.abs(p.x - gx) + p.width / 2 <= gw / 2 - 0.2 && Math.abs(p.z - gz) + p.depth / 2 <= gd / 2 - 0.2;
  next.pads.forEach((pad, index) => {
    if (pad?.from || ![pad?.x, pad?.z, pad?.width, pad?.depth, pad?.height].every(Number.isFinite) || !wet(pad)) return;
    let placed = null;
    search: for (let step = 0.5; step <= 20; step += 0.5) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const moved = { ...pad, x: +(pad.x + dx * step).toFixed(2), z: +(pad.z + dz * step).toFixed(2) };
      if (inside(moved) && !wet(moved)) { placed = moved; break search; }
    }
    if (!placed) for (const axis of ['width', 'depth']) for (const sign of [-1, 1]) {
      for (let cut = 0.5; pad[axis] - cut >= 5 && !placed; cut += 0.5) {
        const key = axis === 'width' ? 'x' : 'z', trimmed = { ...pad, [axis]: +(pad[axis] - cut).toFixed(2), [key]: +(pad[key] + sign * cut / 2).toFixed(2) };
        if (!wet(trimmed)) placed = trimmed;
      }
    }
    if (!placed) return;
    next.pads[index] = placed;
    changes.push({ kind: 'padMovedOffRiver', index, before: pad, after: placed, reason: `平場${index + 1}(${pad.x}, ${pad.z})が川の流路に重なり、水をせき止める盛り土になっていたため、${placed.width !== pad.width || placed.depth !== pad.depth ? `川側を${placed.width}x${placed.depth}mまで縮めた` : `(${placed.x}, ${placed.z})へ川の外まで動かした`}（高さは変更なし）` });
  });
  return changes.length ? { draft: { ...draft, terrainDesign: next }, changes } : { draft, changes: [] };
}

// A plaza the request places by direction (「入口は南側の広場」) that the design leaves out: the model has usually put the
// entrance (spawn) or a road end there and drawn no flat ground under it. A level plaza is laid at that spot, at the height
// of the road end or the ground there, where it fits on the ground clear of water and of flats at another height. With no
// entrance or road end on that side there is nothing to place it by, and the inspection still asks the model for it.
export function addRequestedDirectionalPlazas(draft, request) {
  const design = draft?.terrainDesign, ground = (Array.isArray(draft?.objects) ? draft.objects : []).find(o => o?.role === 'ground');
  if (design?.enabled !== true || !ground || ![...ground.pos, ...ground.size].every(Number.isFinite)) return { draft, changes: [] };
  const wanted = [...new Set(requestedDirectionalPlazas(request).map(m => m[1]))];
  if (!wanted.length) return { draft, changes: [] };
  const [gx, , gz] = ground.pos, [gw, , gd] = ground.size, next = structuredClone(design), changes = [];
  next.pads ??= []; next.paths ??= [];
  const onSide = (dir, x, z) => dir === '北' ? z < gz : dir === '南' ? z > gz : dir === '東' ? x > gx : x < gx;
  const outward = (dir, x, z) => dir === '北' ? gz - z : dir === '南' ? z - gz : dir === '東' ? x - gx : gx - x;
  const nearRiver = (x, z, w, d) => (next.rivers || []).some(river => (river?.points || []).slice(1).some((b, k) => {
    const a = river.points[k], dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz || 1;
    return [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]].some(([sx, sz]) => {
      const px = x + sx * w / 2, pz = z + sz * d / 2, t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / len2));
      return Math.hypot(px - a.x - t * dx, pz - a.z - t * dz) < (river.width || 0) / 2 + 1;
    });
  }));
  for (const dir of wanted) {
    if (next.pads.some(p => [p.x, p.z, p.width, p.depth].every(Number.isFinite) && p.width >= 4 && p.depth >= 4 && p.purpose !== 'building' && onSide(dir, p.x, p.z))) continue;
    const spawn = draft.objects.filter(o => o?.role === 'spawn' && Array.isArray(o.pos) && o.pos.every(Number.isFinite) && onSide(dir, o.pos[0], o.pos[2])).sort((u, v) => outward(dir, v.pos[0], v.pos[2]) - outward(dir, u.pos[0], u.pos[2]))[0];
    const ends = next.paths.flatMap(path => Array.isArray(path?.points) && path.points.length >= 2 ? [path.points[0], path.points.at(-1)] : []).filter(q => [q?.x, q?.z, q?.height].every(Number.isFinite) && onSide(dir, q.x, q.z)).sort((u, v) => outward(dir, v.x, v.z) - outward(dir, u.x, u.z));
    const anchor = spawn ? { x: spawn.pos[0], z: spawn.pos[2], source: `入口${spawn.id}` } : ends[0] ? { x: ends[0].x, z: ends[0].z, source: '道の端' } : null;
    if (!anchor) continue;
    const road = ends.map(q => ({ q, d: Math.hypot(q.x - anchor.x, q.z - anchor.z) })).sort((u, v) => u.d - v.d)[0];
    const height = +(road && road.d <= 8 ? road.q.height : sampleTerrainRelief(next, anchor.x, anchor.z)).toFixed(2);
    let placed = null;
    for (const [w, d] of [[14, 10], [12, 9], [10, 8], [8, 6], [6, 5]]) {
      const x = Math.max(gx - gw / 2 + w / 2 + 0.5, Math.min(gx + gw / 2 - w / 2 - 0.5, anchor.x)), z = Math.max(gz - gd / 2 + d / 2 + 0.5, Math.min(gz + gd / 2 - d / 2 - 0.5, anchor.z));
      const clash = next.pads.some(p => [p.x, p.z, p.width, p.depth, p.height].every(Number.isFinite) && Math.abs(p.height - height) > 0.35 && Math.abs(x - p.x) < (w + p.width) / 2 + 1.7 && Math.abs(z - p.z) < (d + p.depth) / 2 + 1.7);
      if (!clash && !nearRiver(x, z, w, d) && onSide(dir, x, z)) { placed = { x: +x.toFixed(2), z: +z.toFixed(2), width: w, depth: d, height }; break; }
    }
    if (!placed) continue;
    next.pads.push(placed);
    changes.push({ kind: 'requestedPlazaAdded', direction: dir, pad: placed, reason: `指示の「${dir}側の広場」にあたる平場が設計になかったため、${anchor.source}の位置(${placed.x}, ${placed.z})に${placed.width}x${placed.depth}m・高さ${height}mの平らな広場を敷いた` });
  }
  return changes.length ? { draft: { ...draft, terrainDesign: next }, changes } : { draft, changes: [] };
}

// A road point just outside a plaza leaves less than 0.5 m of road once the 0.8 m a road
// keeps clear of a plaza edge is taken off ("road too short"). The point adds nothing the
// neighbouring points do not already say, so it is dropped; an end of the road is carried on instead.
export function dropCrowdedRoadPoints(draft) {
  const design = draft?.terrainDesign;
  if (design?.enabled !== true || !Array.isArray(design.paths) || !Array.isArray(design.pads) || !design.pads.length) return { draft, changes: [] };
  const padsAt = q => design.pads.filter(p => Math.abs(q.x - p.x) <= p.width / 2 && Math.abs(q.z - p.z) <= p.depth / 2);
  // The road stays clear of a plaza edge by 0.8 m: how much road is left outside the plaza, as the compile counts it.
  const remaining = (inside, outside) => {
    const dx = outside.x - inside.x, dz = outside.z - inside.z;
    let fraction = 0;
    for (const p of padsAt(inside)) {
      const tx = dx === 0 ? Infinity : ((p.x + Math.sign(dx) * (p.width / 2 + HARD_ZONE)) - inside.x) / dx;
      const tz = dz === 0 ? Infinity : ((p.z + Math.sign(dz) * (p.depth / 2 + HARD_ZONE)) - inside.z) / dz;
      fraction = Math.max(fraction, Math.min(tx, tz));
    }
    return Math.hypot(dx, dz) * (1 - Math.min(1, fraction));
  };
  const next = structuredClone(design), changes = [];
  for (const [index, path] of next.paths.entries()) {
    const pts = path.points;
    if (Array.isArray(pts) && pts.length >= 2 && pts.every(q => [q.x, q.z, q.height].every(Number.isFinite))) {
      // An end of the road that stops just outside a plaza (so little road is left beyond the plaza's edge) cannot be dropped; it is
      // carried on, in the direction the road was going, until 0.7 m of road remains.
      for (const [end, inner] of [[0, 1], [pts.length - 1, pts.length - 2]]) {
        const q = pts[end], n = pts[inner];
        if (padsAt(q).length || !padsAt(n).length) continue;
        const left = remaining(n, q);
        if (left >= 0.6) continue;
        const length = Math.hypot(q.x - n.x, q.z - n.z) || 1, extra = 0.7 - left, moved = { x: +(q.x + (q.x - n.x) / length * extra).toFixed(2), z: +(q.z + (q.z - n.z) / length * extra).toFixed(2), height: q.height };
        changes.push({ kind: 'roadEndMovedFromPlazaEdge', pathIndex: index, pointIndex: end, before: { ...q }, after: moved, reason: `道${index + 1}の端(${q.x}, ${q.z})が平場の縁のすぐ外で、道が0.5m未満しか残らないため、道の向きのまま${extra.toFixed(2)}m先(${moved.x}, ${moved.z})へ延ばした（高さ・道幅は変更なし）` });
        pts[end] = moved;
      }
    }
    if (!Array.isArray(pts) || pts.length < 3 || !pts.every(q => [q.x, q.z, q.height].every(Number.isFinite))) continue;
    for (let k = pts.length - 2; k >= 1; k--) {
      const q = pts[k];
      if (padsAt(q).length) continue;
      if (![pts[k - 1], pts[k + 1]].some(n => padsAt(n).length && remaining(n, q) < 0.6)) continue;
      pts.splice(k, 1);
      changes.push({ kind: 'crowdedRoadPointDropped', reason: `道${index + 1}の途中の点(${q.x}, ${q.z})が平場の端に近すぎて道が0.5m未満になるため、取り除いた`, pathIndex: index });
    }
  }
  return changes.length ? { draft: { ...draft, terrainDesign: next }, changes } : { draft, changes: [] };
}

// The terrain compile already reconciles a road that runs between plazas (it regrades the road
// between the plazas it ends in and records it as gradeAdjustments). This acts only where that is
// not enough: the compile is tried first, and only a refusal for "road and plaza heights disagree"
// is treated; the regraded draft is adopted only if it then compiles.
// The one place where a road's heights are reconciled with the plazas it passes. The terrain holds
// the ground flat within 0.8 m of a plaza and within 0.8 m of a road's own width, so a road whose
// height differs from a plaza's by more than 0.35 m inside that zone gives one spot two heights.
// The road is regraded around the plaza: its route (the x/z of every point) and width are kept,
// the plaza is never touched, points are added only where the route enters or leaves the zone,
// and the heights between are limited to a gentle slope. Nothing is guessed for a road the user
// gave a height or width for, a change larger than 3 m is a redesign and is left to the model, and
// every changed or added point is recorded with its values before and after.
const ZONE_SLOPE = 0.25, MAX_REGRADE = 3;
export function regradeRoadsNearPads(draft, brief = null, trace = () => {}) {
  const design = draft?.terrainDesign;
  if (design?.enabled !== true || !Array.isArray(design.paths) || !Array.isArray(design.pads) || !design.pads.length) return { draft, changes: [] };
  if ((brief?.requirements || []).some(r => r.role === 'path' && ['height', 'elevation', 'width', 'depth', 'clearance'].includes(r.kind))) return { draft, changes: [] };
  try { compileTerrainDesign(structuredClone(draft)); return { draft, changes: [] }; }
  catch (error) { if (!/交差する道・平場の標高が一致しません/.test(String(error?.message))) return { draft, changes: [] }; }
  const pads = design.pads.filter(p => [p.x, p.z, p.width, p.depth, p.height].every(Number.isFinite));
  const outside = (q, p) => Math.hypot(Math.max(0, Math.abs(q.x - p.x) - p.width / 2), Math.max(0, Math.abs(q.z - p.z) - p.depth / 2));
  const nearest = q => pads.map(p => ({ p, d: outside(q, p) })).sort((a, b) => a.d - b.d)[0];
  const next = structuredClone(design), changes = [];
  for (const [index, path] of next.paths.entries()) {
    const original = path.points;
    if (!Array.isArray(original) || original.length < 2 || !original.every(q => [q.x, q.z, q.height].every(Number.isFinite))) continue;
    const reach = (Number.isFinite(path.width) ? path.width / 2 : 2) + 1.6;
    const along = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, height: a.height + (b.height - a.height) * t });
    // Is there any conflict to resolve on this road? (sampled along the route)
    let conflict = false;
    for (let i = 1; i < original.length && !conflict; i++) {
      const len = Math.hypot(original[i].x - original[i - 1].x, original[i].z - original[i - 1].z), steps = Math.max(1, Math.ceil(len / 0.25));
      for (let k = 0; k <= steps && !conflict; k++) {
        const q = along(original[i - 1], original[i], k / steps);
        for (const p of pads) if (outside(q, p) <= reach && Math.abs(q.height - p.height) > 0.35) conflict = true;
      }
    }
    if (!conflict) continue;
    // Points added where the route crosses the edge of a plaza's zone, so the flat part ends where it should.
    const pts = [{ ...original[0], source: 0 }];
    for (let i = 1; i < original.length; i++) {
      const a = original[i - 1], b = original[i], len = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.max(1, Math.ceil(len / 0.25)), crossings = [];
      let previous = pads.map(p => outside(a, p) <= reach);
      for (let k = 1; k <= steps; k++) {
        const flags = pads.map(p => outside(along(a, b, k / steps), p) <= reach);
        // The point added is the sample just inside the zone, whether the route enters or leaves it, so the zone is flat to its edge.
        if (flags.some((f, n) => f !== previous[n])) crossings.push(flags.some((f, n) => f && !previous[n]) ? k / steps : (k - 1) / steps);
        previous = flags;
      }
      for (const t of crossings) if (t > 0.02 && t < 0.98) pts.push({ ...along(a, b, t), source: -1 });
      pts.push({ ...b, source: i });
    }
    // Zone points are pinned to the plaza's height; the rest are limited to a gentle slope from them.
    const pinned = pts.map(q => { const n = nearest(q); return n.d <= reach ? n.p.height : null; });
    // Two plazas of different heights on one stretch cannot both be met: a design conflict for the model.
    const zones = pts.map(q => pads.filter(p => outside(q, p) <= reach).map(p => p.height));
    if (zones.some(h => h.length && Math.max(...h) - Math.min(...h) > 0.35)) { trace(index, 'two plazas of different heights share the stretch'); continue; }
    const heights = pts.map((q, i) => pinned[i] ?? q.height);
    const ds = pts.map((q, i) => i ? Math.hypot(q.x - pts[i - 1].x, q.z - pts[i - 1].z) : 0);
    for (let pass = 0; pass < 40; pass++) {
      for (let i = 1; i < pts.length; i++) if (pinned[i] === null) heights[i] = Math.max(heights[i - 1] - ZONE_SLOPE * ds[i], Math.min(heights[i - 1] + ZONE_SLOPE * ds[i], heights[i]));
      for (let i = pts.length - 2; i >= 0; i--) if (pinned[i] === null) heights[i] = Math.max(heights[i + 1] - ZONE_SLOPE * ds[i + 1], Math.min(heights[i + 1] + ZONE_SLOPE * ds[i + 1], heights[i]));
    }
    // Unpinned points were forced one way by both neighbours; accept only a profile that really is gentle everywhere.
    if (heights.some((h, i) => i && Math.abs(h - heights[i - 1]) > ZONE_SLOPE * ds[i] + 1e-6)) { trace(index, 'no gentle profile exists between the pinned points'); continue; }
    if (heights.some((h, i) => Math.abs(h - pts[i].height) > MAX_REGRADE) || pts.length > 16) { trace(index, `change larger than ${MAX_REGRADE} m or more than 16 points`); continue; }
    const records = [];
    pts.forEach((q, i) => {
      const before = q.source >= 0 ? original[q.source].height : null, after = +heights[i].toFixed(3);
      if (q.source < 0) records.push({ kind: 'roadPointAdded', pathIndex: index, x: +q.x.toFixed(2), z: +q.z.toFixed(2), before: null, after, interpolated: +q.height.toFixed(3) });
      else if (Math.abs(after - before) > 0.005) records.push({ kind: 'roadRegradedNearPad', pathIndex: index, pointIndex: q.source, x: q.x, z: q.z, before, after });
    });
    if (!records.length) { trace(index, 'no point needed a change'); continue; }
    path.points = pts.map((q, i) => ({ x: q.x, z: q.z, height: +heights[i].toFixed(3) }));
    changes.push(...records.map(r => ({ ...r, reason: r.kind === 'roadPointAdded'
      ? `道${index + 1}が平場の影響範囲(縁から約${reach.toFixed(1)}m)に入る位置(${r.x}, ${r.z})に点を追加（経路の形は変更なし、高さ${r.after}m）`
      : `道${index + 1}の点(${r.x}, ${r.z})の高さを平場との食い違いを避けて${r.before}m→${r.after}mへ調整（平場の高さ・経路・道幅は変更なし）` })));
  }
  if (!changes.length) return { draft, changes: [] };
  // Adopt the regrade only if the terrain now compiles; otherwise the original problem stays for the model.
  const candidate = { ...draft, terrainDesign: next };
  try { compileTerrainDesign(structuredClone(candidate)); } catch (error) { trace(-1, `still refused after the regrade: ${String(error?.message).slice(0, 120)}`); return { draft, changes: [] }; }
  return { draft: candidate, changes };
}

// Numbers a model writes just past what the terrain design accepts (a valley road at -6 m where the
// limit is -5 m). Pulled to the limit when the overshoot is small; a large one is a real mistake.
const DESIGN_LIMITS = { baseHeight: [-5, 20], radius: [3, 60], rise: [-12, 12], padHeight: [-5, 24], pathHeight: [-5, 24], pathWidth: [3, 12] };
const MAX_OVERSHOOT = 3;
export function clampTerrainDesignRanges(draft) {
  const design = draft?.terrainDesign;
  if (design?.enabled !== true) return { draft, changes: [] };
  const next = structuredClone(design), changes = [];
  const pull = (item, key, limit, label) => {
    const value = item?.[key], [low, high] = DESIGN_LIMITS[limit];
    if (!Number.isFinite(value) || (value >= low && value <= high)) return;
    const to = Math.min(high, Math.max(low, value));
    if (Math.abs(to - value) > MAX_OVERSHOOT) return;
    changes.push({ kind: 'terrainDesignClamped', reason: `${label}の${key}=${value}が許容範囲(${low}〜${high})を少し超えたため${to}へ調整`, before: value, after: to });
    item[key] = to;
  };
  pull(next, 'baseHeight', 'baseHeight', '基本標高');
  (next.hills || []).forEach((h, i) => { pull(h, 'radius', 'radius', `丘${i + 1}`); pull(h, 'rise', 'rise', `丘${i + 1}`); });
  (next.ridges || []).forEach((r, i) => { pull(r, 'radius', 'radius', `尾根${i + 1}`); (r.points || []).forEach(p => pull(p, 'rise', 'rise', `尾根${i + 1}の点`)); });
  (next.pads || []).forEach((p, i) => pull(p, 'height', 'padHeight', `平場${i + 1}`));
  (next.paths || []).forEach((path, i) => { pull(path, 'width', 'pathWidth', `道${i + 1}`); (path.points || []).forEach(p => pull(p, 'height', 'pathHeight', `道${i + 1}の点`)); });
  return changes.length ? { draft: { ...draft, terrainDesign: next }, changes } : { draft, changes: [] };
}

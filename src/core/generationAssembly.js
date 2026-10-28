import ASSETS from '../assets.json' with { type: 'json' };
import { isWalkable, isUpright, surfaceTop, localXZ, worldXZ, boxesOverlap, getBounds, footprintContains } from './spatialGeometry.js';

// Compile optional relational coordinates only during NEW AI generation. Saved
// projects and manual edits are never reassembled. IDs, counts and colours stay.
export function assembleGeneration(raw, normalized, brief, { allowFloating = false } = {}) {
  const objects = structuredClone(normalized), changes = [], issues = [];
  const source = new Map(raw.map(o => [o.id, o]));
  const byId = new Map(objects.map(o => [o.id, o]));
  const set = (o, pos, size = o.size, rot = o.rot, reason) => {
    if (JSON.stringify([o.pos, o.size, o.rot]) !== JSON.stringify([pos, size, rot])) changes.push({ id: o.id, reason, before: { pos: o.pos, size: o.size, rot: o.rot }, after: { pos, size, rot } });
    Object.assign(o, { pos, size, rot });
  };
  // A tower or landmark is a fixed-size model (a tower is 7 to 20 m tall): drawn as a 1.5 m pillar it comes out
  // many times larger than asked, standing in the way. That is a wrong choice of model, not a size to be corrected quietly.
  for (const o of objects.filter(p => ['tower', 'landmark'].includes(p.role))) {
    const asked = source.get(o.id)?.size;
    if (!Array.isArray(asked) || !asked.every(Number.isFinite)) continue;
    if (Math.max(...o.size.map((v, i) => v / Math.max(asked[i], 0.1))) > 2.5) issues.push(`${o.id}: ${o.role}は実寸固定のモデルで、指定の大きさ${asked.join('×')}mが${o.size.map(v => v.toFixed(1)).join('×')}mになります。小さな柱・門柱はrole=cover(variant=2、約1.2×2.5m)かpropを使ってください。`);
  }
  for (const o of objects) {
    const s = source.get(o.id);
    if (s?.surfaceY !== undefined && o.role !== 'climb') {
      if (!isWalkable(o) || o.role === 'climb' || !Number.isFinite(s.surfaceY) || Math.abs(s.surfaceY) > 40) issues.push(`${o.id}: surfaceYは水平な歩行床の上面標高を指定してください。`);
      else set(o, [o.pos[0], s.surfaceY - o.size[1] / 2, o.pos[2]], o.size, o.rot, '床上面の標高から中心座標を計算');
    }
  }
  // Correct the common centre/top confusion only within the slab thickness.
  // Large disagreements still fail the independent requirement checker.
  for (const r of brief.requirements.filter(r => r.kind === 'elevation' && r.comparison === 'exact')) {
    for (const o of objects.filter(o => o.role === r.role && isWalkable(o) && o.role !== 'climb')) {
      if (Math.abs(o.pos[1] + o.size[1] / 2 - r.value) <= Math.min(0.6, o.size[1]) + 1e-6) set(o, [o.pos[0], r.value - o.size[1] / 2, o.pos[2]], o.size, o.rot, '明示された床上面標高に合わせる');
    }
  }
  // A platform that rests on a support is seated before any stair is fitted to it, so the stair meets the
  // top the platform will really have rather than the height the model guessed.
  if (!allowFloating) for (const o of objects.filter(p => p.role === 'platform' && isUpright(p) && !p.customModelUrl)) {
    const s = source.get(o.id), support = s?.supportId ? byId.get(s.supportId) : null;
    if (!support || support === o || s.surfaceY !== undefined || !isWalkable(support) || support.role === 'climb') continue;
    const height = surfaceTop(support, o.pos[0], o.pos[2]);
    if (Number.isFinite(height)) set(o, [o.pos[0], height + o.size[1] / 2, o.pos[2]], o.size, o.rot, `${support.id}の上面に足場を接地（階段を取り付ける前に確定）`);
  }
  for (const o of objects) {
    let s = source.get(o.id);
    if (o.role !== 'climb' || o.variant === 2) continue;
    if (!s?.stairTo) {
      const expectedTop=o.pos[1]+o.size[1]/2,expectedLow=o.pos[1]-o.size[1]/2;
      const candidates=objects.filter(p=>p!==o&&isWalkable(p)&&p.role!=='climb'&&!p.terrainProfile).map(p=>{
        const [x,z]=localXZ(p,o.pos[0],o.pos[2]);
        return {p,distance:Math.hypot(Math.max(0,Math.abs(x)-p.size[0]/2),Math.max(0,Math.abs(z)-p.size[2]/2)),top:p.pos[1]+p.size[1]/2};
      }).filter(p=>Math.abs(p.top-expectedTop)<=.6&&p.top>expectedLow+.6&&p.distance<=Math.max(3,o.size[2])).sort((a,b)=>a.distance-b.distance);
      const lower=objects.filter(p=>p!==o&&isWalkable(p)&&p.role!=='climb'&&Number.isFinite(surfaceTop(p,o.pos[0],o.pos[2]))&&Math.abs(surfaceTop(p,o.pos[0],o.pos[2])-expectedLow)<=.12);
      // Infer only an unambiguous nearby landing at the authored stair height.
      // Multi-storey/ambiguous layouts still require explicit IDs from the AI.
      if(candidates.length && (candidates.length===1||candidates[1].distance-candidates[0].distance>1) && lower.length){
        s={...s,stairTo:candidates[0].p.id,stairFrom:lower.sort((a,b)=>a.size[0]*a.size[2]-b.size[0]*b.size[2])[0].id};
        source.set(o.id,s);changes.push({id:o.id,reason:'標高と距離が一意な上下床から欠落した接続IDを補完',stairFrom:s.stairFrom,stairTo:s.stairTo});
      }
    }
    if (!s?.stairTo) {
      issues.push(`${o.id}: stairFrom（下の床ID）とstairTo（上の床ID）が欠落しています。例 stairFrom="${objects.find(p => p.role === 'ground')?.id}", stairTo="${objects.find(p => p.role === 'platform')?.id || '接続先の床ID'}"。向きだけを変える修正ではなく両IDを出力してください。`);
      continue;
    }
    const to = byId.get(s.stairTo), from = byId.get(s.stairFrom);
    if (o.role !== 'climb' || o.variant === 2 || !to || !from || to === o || from === o || !isWalkable(to) || !isWalkable(from) || !isUpright(to) || to.terrainProfile) { issues.push(`${o.id}: 階段のstairFrom/stairToには実在する水平床IDが必要です。`); continue; }
    // The authored X/Z picks the side of the upper landing. Compute an exact
    // perpendicular joint, respecting its yaw; no guessed rotation arithmetic.
    const [x, z] = localXZ(to, o.pos[0], o.pos[2]);
    const wx = to.size[0] / 2, wz = to.size[2] / 2;
    const sideX = Math.abs(x) / wx >= Math.abs(z) / wz;
    const sign = Math.sign(sideX ? x : z) || 1;
    const edgeHalf = sideX ? wz : wx;
    if (o.size[0] > edgeHalf * 2 - 0.2) { issues.push(`${o.id}: 接続先の辺より階段が広すぎます。`); continue; }
    const along = Math.max(-edgeHalf + o.size[0] / 2 + 0.1, Math.min(edgeHalf - o.size[0] / 2 - 0.1, sideX ? z : x));
    const edge = worldXZ(to, sideX ? sign * wx : along, sideX ? along : sign * wz);
    const yaw = (to.rot?.[1] || 0) + (sideX ? -sign * Math.PI / 2 : sign > 0 ? Math.PI : 0);
    const dx = Math.sin(yaw), dz = Math.cos(yaw);
    const top = surfaceTop(to, ...edge);
    const initialLow = surfaceTop(from, edge[0] - dx * o.size[2], edge[1] - dz * o.size[2]);
    if (!Number.isFinite(initialLow) || top <= initialLow) { issues.push(`${o.id}: 階段の下端がstairFromの床上にありません。`); continue; }
    const rise = top - initialLow, length = Math.max(o.size[2], Math.round(rise / 0.4) * 0.5);
    const low = surfaceTop(from, edge[0] - dx * (length + 0.4), edge[1] - dz * (length + 0.4));
    if (!Number.isFinite(low) || Math.abs(low - initialLow) > 0.05) { issues.push(`${o.id}: 下端の踊り場を確保できません。`); continue; }
    set(o, [edge[0] - dx * length / 2, low + rise / 2, edge[1] - dz * length / 2], [o.size[0], rise, length], [0, yaw, 0], `${from.id}→${to.id}の床端に階段を接続`);
  }
  // A tree, rock or plant placed on top of a start/goal marker leaves the player
  // standing inside it. Slide the decoration aside by the smallest step; its
  // count and kind are unchanged and the support step below reseats it.
  const markers = objects.filter(o => ['spawn', 'goal', 'checkpoint', 'exit'].includes(o.role));
  const terrainSurface = byId.get('__generated_terrain');
  if (!allowFloating && markers.length && terrainSurface) for (const o of objects) {
    if (!['tree', 'rock', 'plant'].includes(o.role) || source.get(o.id)?.supportId !== '__generated_terrain') continue;
    const covers = (x, z) => markers.some(m => { const b = getBounds({ ...o, pos: [x, o.pos[1], z] }); return m.pos[0] > b.minX - 1 && m.pos[0] < b.maxX + 1 && m.pos[2] > b.minZ - 1 && m.pos[2] < b.maxZ + 1; });
    if (!covers(o.pos[0], o.pos[2])) continue;
    search: for (let step = 1; step <= 10; step++) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [.7, .7], [-.7, .7], [.7, -.7], [-.7, -.7]]) {
      const x = o.pos[0] + dx * step, z = o.pos[2] + dz * step;
      if (!Number.isFinite(surfaceTop(terrainSurface, x, z)) || covers(x, z) || objects.some(p => p !== o && ['tree', 'rock', 'building'].includes(p.role) && boxesOverlap({ ...o, pos: [x, p.pos[1], z], size: o.size }, p))) continue;
      set(o, [x, o.pos[1], z], o.size, o.rot, '開始・目標の地点と重なるため、同じ種類のまま最小限だけ横へ移動');
      break search;
    }
  }
  // A bridge crosses a river; one drawn lying along the river, inside the water, joins nothing. Its long
  // side is turned across the river (its length and width are swapped; position, height and colour stay),
  // when the bridge sits within the water and both are aligned the same way.
  if (!allowFloating) for (const bridge of objects.filter(o => o.role === 'bridge' && o.type === 'box' && isUpright(o) && !o.customModelUrl)) {
    for (const w of objects.filter(o => o.role === 'water' && o.type === 'box' && isUpright(o) && !o.customModelUrl && Math.abs((o.rot?.[1] || 0) - (bridge.rot?.[1] || 0)) < 0.01)) {
      const riverAlongZ = w.size[2] >= w.size[0], bridgeAlongZ = bridge.size[2] >= bridge.size[0];
      if (riverAlongZ !== bridgeAlongZ || Math.max(...bridge.size.filter((_, i) => i !== 1)) <= Math.min(w.size[0], w.size[2]) + 0.5) continue;
      const [lx, lz] = localXZ(w, bridge.pos[0], bridge.pos[2]);
      if (Math.abs(lx) > w.size[0] / 2 || Math.abs(lz) > w.size[2] / 2) continue;
      set(bridge, bridge.pos, [bridge.size[2], bridge.size[1], bridge.size[0]], bridge.rot, `橋が川に沿って水の上に置かれていたため、長い辺を川を渡る向きへ入れ替えた（位置・高さ・個数は変更なし）`);
      break;
    }
  }
  // A river is as deep as its bed. The model draws a thin sheet at the surface; where the terrain was cut
  // below it, the sheet is deepened to the bed so that nobody can stand in the channel under the water.
  if (!allowFloating && terrainSurface) for (const w of objects.filter(o => o.role === 'water' && o.type === 'box' && isUpright(o) && !o.customModelUrl)) {
    const top = w.pos[1] + w.size[1] / 2, reach = Math.hypot(w.size[0], w.size[2]) / 2;
    let bed = Infinity;
    for (let dx = -reach; dx <= reach; dx += 1) for (let dz = -reach; dz <= reach; dz += 1) {
      const [x, z] = [w.pos[0] + dx, w.pos[2] + dz];
      if (!footprintContains(w, x, z)) continue;
      const y = surfaceTop(terrainSurface, x, z);
      if (Number.isFinite(y)) bed = Math.min(bed, y);
    }
    const bottom = w.pos[1] - w.size[1] / 2;
    if (!Number.isFinite(bed) || bed >= bottom - 0.1 || bed < top - 8) continue;
    set(w, [w.pos[0], (top + bed - 0.1) / 2, w.pos[2]], [w.size[0], top - bed + 0.1, w.size[2]], w.rot, `川の水面から川底(${bed.toFixed(1)}m)までを水の深さとして延長（水面の高さ・位置・幅は変更なし）`);
  }
  // A building whose edge or corner only just runs over a thin paved slab (a plaza it is meant to
  // surround) is slid straight away from the slab until the two no longer overlap. Only a small
  // overlap of a building standing outside the slab, only inside the ground, never into another solid.
  // A building standing on a slab (its centre inside it) is left where the model put it.
  if (!allowFloating) {
    const ground = objects.find(o => o.role === 'ground');
    const slabs = objects.filter(o => o.role === 'platform' && o.size[1] <= 0.3 && isUpright(o) && !o.customModelUrl);
    for (const o of objects.filter(p => p.role === 'building' && isUpright(p) && !p.customModelUrl)) {
      for (const slab of slabs) {
        if (!boxesOverlap(o, slab)) continue;
        const [lx, lz] = localXZ(slab, o.pos[0], o.pos[2]);
        if (Math.abs(lx) <= slab.size[0] / 2 && Math.abs(lz) <= slab.size[2] / 2) continue;
        const away = Math.abs(lx) / (slab.size[0] / 2) >= Math.abs(lz) / (slab.size[2] / 2) ? [Math.sign(lx) || 1, 0] : [0, Math.sign(lz) || 1];
        const [wx, wz] = [away[0] * Math.cos(slab.rot?.[1] || 0) + away[1] * Math.sin(slab.rot?.[1] || 0), -away[0] * Math.sin(slab.rot?.[1] || 0) + away[1] * Math.cos(slab.rot?.[1] || 0)];
        for (let step = 0.1; step <= 3; step += 0.1) {
          const at = { ...o, pos: [o.pos[0] + wx * step, o.pos[1], o.pos[2] + wz * step] };
          if (boxesOverlap(at, slab)) continue;
          const b = getBounds(at);
          if (ground && (b.minX < ground.pos[0] - ground.size[0] / 2 || b.maxX > ground.pos[0] + ground.size[0] / 2 || b.minZ < ground.pos[2] - ground.size[2] / 2 || b.maxZ > ground.pos[2] + ground.size[2] / 2)) break;
          if (objects.some(p => p !== o && !ASSETS.SEMANTIC_PREFABS[p.role]?.floorLike && p.role !== 'platform' && boxesOverlap(at, p))) break;
          set(o, at.pos, o.size, o.rot, `${slab.id}の端に建物が重なっていたため、${step.toFixed(1)}mだけ外へ移動（大きさ・向き・個数は変更なし）`);
          break;
        }
      }
    }
  }
  // A tree, rock or plant standing on a stair blocks it (the walk check uses its real model). The stair is assembled by now, so the
  // decoration is slid aside by the smallest step that clears every stair (and the solid things around); its kind and count do not change.
  if (!allowFloating && terrainSurface) {
    const stairs = objects.filter(p => p.role === 'climb' && p.variant !== 2);
    const solids = objects.filter(p => ['tree', 'rock', 'building', 'tower', 'wall', 'cliff'].includes(p.role));
    for (const o of objects.filter(p => ['tree', 'rock', 'plant'].includes(p.role) && source.get(p.id)?.supportId === '__generated_terrain')) {
      const clashes = pos => { const at = { ...o, pos }; return stairs.some(st => boxesOverlap({ ...at, size: [o.size[0] + 0.6, o.size[1], o.size[2] + 0.6] }, st)); };
      if (!clashes(o.pos)) continue;
      search: for (let step = 1; step <= 12; step++) for (let k = 0; k < 16; k++) {
        const a = k * Math.PI / 8, x = +(o.pos[0] + Math.cos(a) * step).toFixed(2), z = +(o.pos[2] + Math.sin(a) * step).toFixed(2), y = surfaceTop(terrainSurface, x, z);
        if (!Number.isFinite(y) || clashes([x, o.pos[1], z]) || solids.some(p => p !== o && boxesOverlap({ ...o, pos: [x, p.pos[1], z] }, p))) continue;
        set(o, [x, o.pos[1], z], o.size, o.rot, `階段の上にあったため、同じ種類のまま${step}m横へ移動`);
        break search;
      }
    }
  }
  for (const o of objects) {
    let s = source.get(o.id);
    if (!allowFloating && !s?.supportId && ASSETS.SEMANTIC_PREFABS[o.role]?.groundSnap) {
      const bottom=o.pos[1]-o.size[1]/2;
      const supports=objects.filter(p=>p!==o&&isWalkable(p)&&p.role!=='climb').map(p=>({p,y:surfaceTop(p,o.pos[0],o.pos[2])})).filter(p=>Number.isFinite(p.y)&&Math.abs(p.y-bottom)<=1.2).sort((a,b)=>Math.abs(a.y-bottom)-Math.abs(b.y-bottom));
      if(supports.length&&(supports.length===1||Math.abs(supports[1].y-bottom)-Math.abs(supports[0].y-bottom)>.15))s={...s,supportId:supports[0].p.id};
    }
    // Trees, rocks and plants stand on the ground. A model's height guess is often off by metres
    // over relief; with no floor in reach and generated terrain below, seat it on that terrain
    // instead of spending a repair request on a floating tree.
    // The same holds for any other model that stands on the ground (a tower, cover, a prop); buildings have their own plots,
    // and walls and doors belong to the structures they are part of.
    if (!allowFloating && !s?.supportId && (['tree', 'rock', 'plant'].includes(o.role) || (ASSETS.SEMANTIC_PREFABS[o.role]?.groundSnap && !['building', 'wall', 'door', 'spawn', 'goal', 'checkpoint', 'exit'].includes(o.role))) && byId.has('__generated_terrain') &&
        Number.isFinite(surfaceTop(byId.get('__generated_terrain'), o.pos[0], o.pos[2]))) s = { ...s, supportId: '__generated_terrain' };
    // A start/goal marker a little off the compiled terrain surface is the
    // commonest height slip; seat it on the surface instead of failing the run.
    // A bridge over water on the generated terrain crosses the river between its banks. The banks' height is
    // only known once the terrain is built, so a deck height the model guessed (no support named, or a surfaceY
    // the request never asked for) is replaced by the banks' height; left at the guess the deck is a step up from both banks.
    if (!allowFloating && (!s?.supportId || s.supportId === '__generated_terrain') && o.role === 'bridge' && o.type === 'box' && isUpright(o) && !o.customModelUrl && byId.has('__generated_terrain') &&
        (s?.surfaceY === undefined || !brief.requirements.some(r => r.role === 'bridge' && ['elevation', 'height', 'clearance'].includes(r.kind))) &&
        objects.some(w => w.role === 'water' && w.type === 'box' && footprintContains(w, o.pos[0], o.pos[2]))) s = { ...s, supportId: '__generated_terrain', surfaceY: undefined };
    if (!s?.supportId && ['spawn', 'goal', 'checkpoint', 'exit'].includes(o.role) && byId.has('__generated_terrain')) {
      const top = surfaceTop(byId.get('__generated_terrain'), o.pos[0], o.pos[2]);
      if (Number.isFinite(top) && Math.abs(o.pos[1] - o.size[1] / 2 - top) <= 1.5) s = { ...s, supportId: '__generated_terrain', markerSeat: true };
    }
    if (!s?.supportId) continue;
    const support = byId.get(s.supportId);
    const height = support && support !== o && isWalkable(support) && support.role !== 'climb' ? surfaceTop(support, o.pos[0], o.pos[2]) : null;
    // A bridge crosses a gap: its deck is level with the banks it joins, not seated on the bed under its middle.
    let deck = height, size = o.size;
    if (o.role === 'bridge' && support?.role === 'landform' && support.terrainProfile && isUpright(o) && !o.customModelUrl && Number.isFinite(height) && s.surfaceY === undefined) {
      const along = o.size[0] >= o.size[2] ? [1, 0] : [0, 1], half = Math.max(o.size[0], o.size[2]) / 2 - 0.3;
      const ends = [-1, 1].map(sign => { const [x, z] = worldXZ(o, along[0] * sign * half, along[1] * sign * half); return surfaceTop(support, x, z); });
      if (ends.every(Number.isFinite) && Math.min(...ends) - height >= 0.4 && Math.abs(ends[0] - ends[1]) <= 0.6) deck = Math.max(...ends);
      // The deck clears the water under it: a floor level with the surface counts as standing in the water.
      const over = objects.filter(w => w.role === 'water' && w.type === 'box' && footprintContains(w, o.pos[0], o.pos[2]));
      if (over.length) deck = Math.max(deck, Math.max(...over.map(w => w.pos[1] + w.size[1] / 2)) + 0.25);
      // Raised above a bank by less than a step, a thin deck leaves a gap under its end that is walked into as a
      // ledge, not stepped onto: the deck is made deep enough to rest on that bank (its top and span unchanged).
      const lift = ends.every(Number.isFinite) && deck !== height ? deck - Math.min(...ends) : 0;
      if (lift > o.size[1] + 0.05 && lift <= 0.6) size = [o.size[0], +lift.toFixed(3), o.size[2]];
    }
    if (!Number.isFinite(height)) issues.push(`${o.id}: supportId=${s.supportId}の支持床が配置位置にありません。`);
    else if (ASSETS.SEMANTIC_PREFABS[o.role]?.groundSnap || s.markerSeat || isWalkable(o) && s.surfaceY === undefined && !s.stairTo) set(o, [o.pos[0], deck !== height ? deck - size[1] / 2 : height + o.size[1] / 2, o.pos[2]], size, o.rot, deck !== height ? `${support.id}の両岸の高さに橋の床面を合わせた（中央の川底には置かない${size !== o.size ? '。岸との間に隙間が残らないよう橋床を岸まで厚くした' : ''}）` : `${support.id}の上面に実寸モデルを接地`);
  }
  // Open only the narrow strip a declared stair crosses. Never cut a counted
  // wall, an uploaded model, a rotated/non-box wall or most of a wall's length.
  const wallCount = brief.requirements.some(r => r.role === 'wall' && r.kind === 'count');
  if (!wallCount) for (const stair of objects.filter(o => o.role === 'climb' && source.get(o.id)?.stairTo)) {
    const clearance = { ...stair, size: [stair.size[0] + 0.8, stair.size[1] + 3.6, stair.size[2] + 1], pos: [stair.pos[0], stair.pos[1] + 1.8, stair.pos[2]] };
    for (const wall of [...objects].filter(o => o.role === 'wall' && o.type === 'box' && !o.customModelUrl && isUpright(o) && !o.spatialAppearance)) {
      if (!boxesOverlap(wall, clearance)) continue;
      const axis = wall.size[0] > wall.size[2] ? 0 : 2, half = wall.size[axis] / 2;
      const corners = [-1, 1].flatMap(x => [-1, 1].map(z => localXZ(wall, ...worldXZ(clearance, x * clearance.size[0] / 2, z * clearance.size[2] / 2))));
      const k = axis === 0 ? 0 : 1;
      const low = Math.max(-half, Math.min(...corners.map(p => p[k]))), high = Math.min(half, Math.max(...corners.map(p => p[k])));
      if (high <= low || high - low > wall.size[axis] * 0.65) continue;
      const segments = [[-half, low], [high, half]].filter(([a,b]) => b - a > 0.2);
      if (!segments.length) continue;
      const replacement = segments.map(([a,b], i) => {
        const centre = (a+b)/2, [x,z] = worldXZ(wall, axis === 0 ? centre : 0, axis === 2 ? centre : 0);
        const size = [...wall.size]; size[axis] = b-a;
        let id = i ? `${wall.id}_opening_${stair.id}` : wall.id;
        while (i && objects.some(o => o.id === id)) id += '_';
        return {...wall,id,pos:[x,wall.pos[1],z],size};
      });
      objects.splice(objects.indexOf(wall),1,...replacement);
      changes.push({id:wall.id,reason:`${stair.id}の通行幅に合わせて壁の開口部を組み立て`,before:wall,after:replacement});
    }
  }
  // A thin floating roof is not a supported structure. Add corner supports only
  // where an actual lower surface exists and no authored solid is displaced.
  if (!allowFloating && !wallCount) for (const floor of [...objects].filter(o => ['platform','bridge'].includes(o.role) && isUpright(o) && !o.customModelUrl)) {
    const bottom = floor.pos[1] - floor.size[1]/2;
    for (const [i,[u,v]] of [[-1,-1],[-1,1],[1,-1],[1,1]].entries()) {
      const [x,z] = worldXZ(floor,u*Math.max(0,floor.size[0]/2-.45),v*Math.max(0,floor.size[2]/2-.45));
      const lower = objects.filter(o=>o!==floor && isWalkable(o) && o.role!=='climb').map(o=>surfaceTop(o,x,z)).filter(y=>Number.isFinite(y)&&y<bottom-.1);
      if (!lower.length) continue;
      const y=Math.max(...lower),height=bottom-y;
      if(height<.8)continue;
      const post={id:`${floor.id}_support_${i}`,name:'床を支える柱',type:'box',role:'wall',variant:1,material:1,pos:[x,y+height/2,z],size:[.5,height,.5],rot:[0,floor.rot?.[1]||0,0],color:floor.color||'#d2c8b5'};
      if(objects.some(o=>o.id===post.id || o!==floor && o.role!=='ground' && boxesOverlap(o,post)))continue;
      objects.push(post);changes.push({id:post.id,reason:`${floor.id}の下部を実在する床まで支持`,after:post});
    }
  }
  return { objects, changes, issues };
}

export const GENERATION_ASSEMBLY_PROMPT = `
【配置の組み立て】
小さく密度のある完成空間を優先。広さの明示がなければ主空間を24〜40m程度に収める。主役の床、周囲の壁や建築、入口、植栽のまとまりを構成し、空白の巨大な地面だけにしない。装飾を均等な格子に置かない。指示に応じて平面・中庭・街路など骨格を変える。
posは中心座標。水平床ground/platform/bridge/corridorにはsurfaceY（床上面の標高m）を記入する。屋上3mならsurfaceY=3。薄い空中の板を屋上と呼ばず、下部の壁や支持構造も配置する。
接地する木・岩・建物・壁にはsupportId（足元のgroundや床のID）を記入。配置位置がその床の外なら接地できない。素材は実寸固定なので、木や建物の周囲に実寸の余白を取る。
階段climbはvariant=1、stairFrom=下の床ID、stairTo=上の床IDを必ず記入。posのX/Zで接続する上階の辺を選び、階段用の空間と上下の開口部を先に確保。上階の端から外へsize[2]だけ張り出す階段が組み立てられる。向き・高さ・中心Yは床端から計算される。階段が通る場所に壁・木・建物を置かない。
道pathは太い表示線で歩行床ではない。景観の道には薄いcorridor床を連続させ、地面から0.04〜0.1mだけ上に舗装。曲がり角は少し重ねる。中庭入口・階段・主要地点へ道を実際につなぐ。
建物はcolor=壁、color2=屋根、color3=細部。白壁と青緑屋根なら別々に指定。自然素材モデルのmaterial=0は元の材質を保持する。全てに同じ画像テクスチャを貼らない。説明は簡潔な日本語、spatial_planは400文字以内、key_decisionsは最大6件。長文や反復を避け、トークンを形状の配置に使う。`;

// Reuse existing metre-scaled materials without adding solids or changing colours.
export function finishGenerationSurfaces(objects, brief = {}) {
  const designText = (brief.designGoals || []).map(g => g.description).join(' ');
  const pavedGround = /中庭|石舗装|石畳|舗装広場/.test(designText) && !/草地|森|土の|芝生/.test(designText);
  return objects.map(o => {
    if (o.spatialAppearance || o.customModelUrl || o.type !== 'box') return o;
    const surface = { ground: pavedGround ? 'paving' : null, wall: 'stucco', platform: 'paving', corridor: 'paving', bridge: 'paving', climb: 'concrete' }[o.role];
    if (!surface) return o;
    return { ...o, spatialAppearance: { version: 1, style: 'harbor', surface, district: 'neutral', category: 'structure', moduleId: 'direct_generation', ...(o.role === 'wall' && o.size[1]>1 && Math.max(o.size[0],o.size[2])>2 ? {edgeTrim:true} : {}) } };
  });
}

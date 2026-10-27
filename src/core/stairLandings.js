import { sampleTerrainRelief } from './terrainRelief.js';
import { compileTerrainDesign } from './terrainDesign.js';

// A stair that connects floors needs two things the model often leaves out: the IDs of the floors it
// joins, and flat ground at its foot. On generated terrain the upper floor is a platform the model
// drew and the lower floor is the terrain itself, so the foot needs a flat landing; a stair set on a
// slope fails the "landing" check, and a road that runs up the same corridor leaves two climbs in one
// place. This plans the connection before the terrain is compiled:
//   - the upper floor is the one platform whose top meets the stair's top and which lies at the stair
//     (two equally good platforms, or none, is ambiguous: nothing is guessed and the stair is left as it is);
//   - the lower floor is the terrain; a flat landing pad is added at the foot unless an existing plaza
//     already is flat at that height, and nothing is added where a plaza of another height is in the way;
//   - a road that runs through the stair's corridor is shortened to end on the landing (its heights
//     elsewhere and its width are kept), unless the request fixes the road's route, heights or width;
//   - the floors' IDs are written onto the stair, which the assembly then places exactly.
// The plan is adopted only if the terrain compiles with it. Every change is recorded before and after.
const TERRAIN_ID = '__generated_terrain';
const HALF_TURN = Math.PI / 2;

const cardinal = yaw => Math.abs(yaw / HALF_TURN - Math.round(yaw / HALF_TURN)) < 0.01;
const finite = (...values) => values.every(Number.isFinite);

// Where the stair meets the upper floor: the same rule the assembly uses to place it.
export function stairAttachment(stair, upper) {
  const yawUpper = upper.rot?.[1] || 0, c = Math.cos(yawUpper), s = Math.sin(yawUpper);
  const dx0 = stair.pos[0] - upper.pos[0], dz0 = stair.pos[2] - upper.pos[2];
  const x = c * dx0 - s * dz0, z = s * dx0 + c * dz0;
  const wx = upper.size[0] / 2, wz = upper.size[2] / 2, sideX = Math.abs(x) / wx >= Math.abs(z) / wz;
  const sign = Math.sign(sideX ? x : z) || 1, edgeHalf = sideX ? wz : wx;
  if (stair.size[0] > edgeHalf * 2 - 0.2) return null;
  const along = Math.max(-edgeHalf + stair.size[0] / 2 + 0.1, Math.min(edgeHalf - stair.size[0] / 2 - 0.1, sideX ? z : x));
  const lx = sideX ? sign * wx : along, lz = sideX ? along : sign * wz;
  const edge = [upper.pos[0] + c * lx + s * lz, upper.pos[2] - s * lx + c * lz];
  const yaw = yawUpper + (sideX ? -sign * HALF_TURN : sign > 0 ? Math.PI : 0);
  return { edge, dir: [Math.sin(yaw), Math.cos(yaw)] };
}

const stairLength = (stair, rise) => Math.max(stair.size[2], Math.round(rise / 0.4) * 0.5);

export function planStairLandings(draft, brief = null) {
  const design = draft?.terrainDesign, objects = draft?.objects;
  if (design?.enabled !== true || !Array.isArray(objects) || !Array.isArray(design.pads) || !Array.isArray(design.paths)) return { draft, changes: [] };
  const fixedRoute = (brief?.requirements || []).some(r => r.role === 'path' && r.kind !== 'count');
  const stairs = objects.filter(o => o?.role === 'climb' && o.variant !== 2 && !o.stairFrom && !o.stairTo && Array.isArray(o.pos) && Array.isArray(o.size) && finite(...o.pos, ...o.size));
  if (!stairs.length) return { draft, changes: [] };
  const floors = objects.filter(o => o?.role === 'platform' && o.type === 'box' && Array.isArray(o.pos) && Array.isArray(o.size) && finite(...o.pos, ...o.size) &&
    !(o.rot || []).some((v, i) => i !== 1 && v) && cardinal(o.rot?.[1] || 0) && !o.customModelUrl);
  let work = structuredClone(draft);
  const changes = [];
  for (const original of stairs) {
    const stair = work.objects.find(o => o.id === original.id);
    const top = stair.pos[1] + stair.size[1] / 2;
    const near = floors.map(f => {
      const platform = work.objects.find(o => o.id === f.id);
      // A platform that rests on the terrain is seated on it: its top is the terrain there plus its thickness.
      const seated = platform.supportId === TERRAIN_ID && !Number.isFinite(platform.surfaceY);
      const groundThere = () => { const pad = work.terrainDesign.pads.find(p => Math.abs(platform.pos[0] - p.x) <= p.width / 2 && Math.abs(platform.pos[2] - p.z) <= p.depth / 2); return pad ? pad.height : sampleTerrainRelief(work.terrainDesign, platform.pos[0], platform.pos[2]); };
      const upperTop = seated ? groundThere() + platform.size[1] : Number.isFinite(platform.surfaceY) ? platform.surfaceY : platform.pos[1] + platform.size[1] / 2;
      const gx = Math.max(0, Math.abs(stair.pos[0] - platform.pos[0]) - platform.size[0] / 2), gz = Math.max(0, Math.abs(stair.pos[2] - platform.pos[2]) - platform.size[2] / 2);
      return { platform, upperTop, distance: Math.hypot(gx, gz) };
    }).filter(f => Math.abs(f.upperTop - top) <= 0.6 && f.distance <= Math.max(3, stair.size[2])).sort((a, b) => a.distance - b.distance);
    // Two platforms equally near the stair: which one it joins is a guess, so none is made.
    if (!near.length || (near.length > 1 && near[1].distance - near[0].distance <= 1)) continue;
    const { platform: upper, upperTop } = near[0];
    const attach = stairAttachment(stair, upper);
    if (!attach) continue;
    const { edge, dir } = attach, foot = length => [edge[0] - dir[0] * length, edge[1] - dir[1] * length];
    // The landing height: the road's own height where it runs into the stair's corridor, otherwise the ground as it lies.
    const corridor = length => {
      const [fx, fz] = foot(length + 2.6), across = stair.size[0] / 2 + 0.3, alongX = Math.abs(dir[0]) > Math.abs(dir[1]);
      return { minX: Math.min(edge[0], fx) - (alongX ? 0.3 : across), maxX: Math.max(edge[0], fx) + (alongX ? 0.3 : across), minZ: Math.min(edge[1], fz) - (alongX ? across : 0.3), maxZ: Math.max(edge[1], fz) + (alongX ? across : 0.3) };
    };
    const inside = (z, q) => q.x >= z.minX && q.x <= z.maxX && q.z >= z.minZ && q.z <= z.maxZ;
    let length = stair.size[2], landingHeight = null, roadEdits = [];
    for (let pass = 0; pass < 3; pass++) {
      const zone = corridor(length);
      roadEdits = [];
      landingHeight = null;
      if (!fixedRoute) for (const [index, path] of work.terrainDesign.paths.entries()) {
        const pts = path.points;
        if (!Array.isArray(pts) || pts.length < 2 || !pts.every(q => finite(q.x, q.z, q.height))) continue;
        // The end nearer the upper floor is the part that would run under the stair; the other end is the approach.
        // The route is walked from the approach end, and cut where it first enters the corridor.
        const reversed = Math.hypot(pts[0].x - edge[0], pts[0].z - edge[1]) < Math.hypot(pts.at(-1).x - edge[0], pts.at(-1).z - edge[1]);
        const route = reversed ? [...pts].reverse() : pts;
        if (inside(zone, route[0])) continue;
        let cut = null;
        for (let i = 1; i < route.length && !cut; i++) {
          const a = route[i - 1], b = route[i], steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25));
          for (let k = 1; k <= steps; k++) { const t = k / steps, q = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, height: a.height + (b.height - a.height) * t }; if (inside(zone, q)) { cut = { q, index: i }; break; } }
        }
        if (!cut) continue;
        roadEdits.push({ index, reversed, keep: route.slice(0, cut.index), height: cut.q.height });
        // The landing takes the height the road already has where it arrives (its last point before the corridor), so the two meet flat.
        landingHeight ??= (route[cut.index - 1] || cut.q).height;
      }
      // With no road in the corridor: a road end close to the landing sets its height (so the two meet flat); otherwise the ground as it lies.
      landingHeight ??= (() => {
        const [fx, fz] = foot(length + 1);
        let nearest = null;
        for (const path of work.terrainDesign.paths) for (const q of [path.points?.[0], path.points?.at(-1)]) if (q && finite(q.x, q.z, q.height) && !fixedRoute) { const d = Math.hypot(q.x - fx, q.z - fz); if (d <= 6 && (!nearest || d < nearest.d)) nearest = { d, height: q.height }; }
        return nearest ? nearest.height : sampleTerrainRelief(work.terrainDesign, fx, fz);
      })();
      const rise = upperTop - landingHeight;
      if (rise < 0.3) { length = null; break; }
      const next = stairLength(stair, rise);
      if (Math.abs(next - length) < 1e-6) break;
      length = next;
    }
    if (length === null) continue;
    landingHeight = Math.round(landingHeight * 20) / 20;
    // The flat landing: wide as the stair plus a metre each side, from just short of the stair's foot to two metres past it.
    const [nx0, nz0] = foot(length - 1), [nx1, nz1] = foot(length + 0.4 + 2.2), pad = {
      x: +((nx0 + nx1) / 2).toFixed(2), z: +((nz0 + nz1) / 2).toFixed(2),
      width: +(Math.abs(dir[0]) > Math.abs(dir[1]) ? Math.abs(nx1 - nx0) : stair.size[0] + 2).toFixed(2), depth: +(Math.abs(dir[0]) > Math.abs(dir[1]) ? stair.size[0] + 2 : Math.abs(nz1 - nz0)).toFixed(2), height: landingHeight };
    if (!(Math.abs(dir[0]) < 0.01 || Math.abs(dir[1]) < 0.01)) continue;
    const covers = work.terrainDesign.pads.some(p => Math.abs(p.height - landingHeight) <= 0.05 && Math.abs(pad.x - p.x) + pad.width / 2 <= p.width / 2 && Math.abs(pad.z - p.z) + pad.depth / 2 <= p.depth / 2);
    // The terrain holds the ground flat for 0.8 m around a plaza: two plazas of different heights closer than that to each other cannot both be kept.
    const clashes = work.terrainDesign.pads.some(p => Math.abs(p.height - landingHeight) > 0.05 && Math.abs(pad.x - p.x) < (pad.width + p.width) / 2 + 1.7 && Math.abs(pad.z - p.z) < (pad.depth + p.depth) / 2 + 1.7);
    if (clashes) continue;
    const attempt = (withRoad, withPad) => {
      const trial = structuredClone(work), t = trial.objects.find(o => o.id === stair.id);
      t.stairTo = upper.id; t.stairFrom = TERRAIN_ID;
      const trialChanges = [{ kind: 'stairFloorsNamed', objectId: stair.id, reason: `${stair.id}の接続先が未指定だったため、上は足場${upper.id}（上面が階段の上端と一致する唯一の足場）、下は地形に決めた` }];
      if (withPad && !covers) { trial.terrainDesign.pads.push(pad); trialChanges.push({ kind: 'stairLandingAdded', objectId: stair.id, reason: `${stair.id}の足元に平らな踊り場(高さ${landingHeight}m)を作った。既存の平場はこの高さで平らではなかった`, pad }); }
      if (withRoad) for (const edit of roadEdits) {
        const path = trial.terrainDesign.paths[edit.index], before = path.points.map(q => ({ ...q })), [lx, lz] = [(nx0 + nx1) / 2, (nz0 + nz1) / 2];
        const kept = edit.keep.map(q => ({ x: q.x, z: q.z, height: q.height })), end = { x: +lx.toFixed(2), z: +lz.toFixed(2), height: landingHeight };
        const last = kept.at(-1), run = last ? Math.hypot(end.x - last.x, end.z - last.z) : 0;
        if (!kept.length || run < 0.5 || Math.abs(end.height - last.height) > run / 3) return null;
        path.points = edit.reversed ? [end, ...kept.reverse()] : [...kept, end];
        trialChanges.push({ kind: 'roadEndMovedToStairLanding', pathIndex: edit.index, before, after: path.points.map(q => ({ ...q })), reason: `道${edit.index + 1}が階段${stair.id}の通り道を通っていたため、踊り場で終わるように短くした（経路の他の点・道幅は変更なし）` });
      }
      try { compileTerrainDesign(structuredClone(trial)); } catch { return null; }
      return { trial, trialChanges };
    };
    const result = attempt(true, true) || (roadEdits.length ? attempt(false, true) : null) || attempt(false, false);
    if (!result) continue;
    work = result.trial;
    changes.push(...result.trialChanges);
  }
  return changes.length ? { draft: work, changes } : { draft, changes: [] };
}

import { sampleTerrainRelief } from './terrainRelief.js';
import { getModelDefault } from './modelCatalog.js';
import { footprintContains } from './spatialGeometry.js';

// Larger landscape features the terrain design can state in a few numbers, built here instead of being
// drawn point by point by the model:
//   rivers      a winding channel (polyline + width): water that follows the line, with the bed cut below it
//   terraces    a stepped hillside (levels of flat ground rising in one direction) joined by one gentle road
//   formations  groups of tall rock (cliff meshes scaled up), for rock towers, buttes and cliff walls
// They are expanded into the ordinary design (pads, a road) and ordinary objects (water, cliffs), before the
// terrain is compiled, so every later check (walking, overlaps, roads) sees the same things it always saw.
// What a feature cannot be built as stated is never dropped quietly: it is recorded as `unbuilt` with the reason.
const DIRECTIONS = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
const finite = (...v) => v.every(Number.isFinite);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// A small seeded generator so the same design always gives the same rocks.
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const FEATURE_LIMITS = { rivers: 4, terraces: 3, formations: 6 };

export function expandDesignFeatures(draft) {
  const design = draft?.terrainDesign;
  if (design?.enabled !== true || design.featuresExpanded === true || !Array.isArray(draft.objects)) return { draft, changes: [], unbuilt: [] };
  const grounds = draft.objects.filter(o => o?.role === 'ground');
  const rivers = Array.isArray(design.rivers) ? design.rivers : [], terraces = Array.isArray(design.terraces) ? design.terraces : [], formations = Array.isArray(design.formations) ? design.formations : [];
  if (!rivers.length && !terraces.length && !formations.length) return { draft, changes: [], unbuilt: [] };
  if (grounds.length !== 1 || !finite(...grounds[0].pos, ...grounds[0].size)) return { draft, changes: [], unbuilt: [] };
  const [gx, , gz] = grounds[0].pos, [gw, , gd] = grounds[0].size;
  const next = structuredClone(design), objects = structuredClone(draft.objects), changes = [], unbuilt = [];
  const used = new Set(objects.map(o => o.id));
  const fresh = base => { let id = base, n = 1; while (used.has(id)) id = `${base}_${n++}`; used.add(id); return id; };
  next.pads ??= []; next.paths ??= [];
  const inside = (x, z, m = 0) => Math.abs(x - gx) <= gw / 2 - m && Math.abs(z - gz) <= gd / 2 - m;
  const reject = (kind, index, reason) => unbuilt.push({ kind, index, reason: `${{ rivers: '川', terraces: '段丘', formations: '岩の群れ' }[kind]}${index + 1}: ${reason}` });

  // ---- terraces: flat steps joined by one road with a gentle slope ----
  terraces.slice(0, FEATURE_LIMITS.terraces).forEach((t, index) => {
    const direction = DIRECTIONS[t?.direction];
    if (!t || !direction || !finite(t.x, t.z, t.width, t.depth, t.levels, t.rise, t.height)) return reject('terraces', index, '数値または向きが不正です');
    const levels = Math.round(t.levels), rise = clamp(t.rise, 0.8, 4), alongZ = direction[0] === 0;
    const across = clamp(t.width, 6, (alongZ ? gw : gd) - 0.2);
    let total = clamp(t.depth, 12, (alongZ ? gd : gw) - 0.2);
    // Between two levels the road needs 3 m of run per metre of rise (1 in 3), plus the flat margin each level keeps (0.8 m, and 0.5 m of road beyond it).
    // Joined by stairs (link = 'stairs'): a stair as long as its rise needs reaches from one level's edge to the next, so the levels are
    // one stair apart (less the 0.8 m the stair's foot rests on the lower floor). Joined by a road (the default): 3 m of run per metre of rise.
    const viaStairs = t.link === 'stairs', stairLen = Math.max(5, Math.round(rise / 0.4) * 0.5);
    const gap = viaStairs ? stairLen - 0.8 : 3 * rise + 3.8, needed = levels * 5 + gap * (levels - 1), room = alongZ ? gd : gw;
    if (levels < 2 || levels > 5) return reject('terraces', index, `段数${levels}は2〜5段で指定してください`);
    // A terrace that is too shallow for its steps is lengthened (within the ground), as the road between levels needs its run.
    if (total < needed - 1e-6) {
      if (needed > room - 2) return reject('terraces', index, `${levels}段(段差${rise}m)には奥行${needed.toFixed(0)}m以上が要りますが、地面は${room}mです。段数か段差を減らしてください`);
      changes.push({ kind: 'terraceLengthened', index, before: total, after: +needed.toFixed(1), reason: `段丘${index + 1}の奥行${total}mでは${levels}段(段差${rise}m)の道の勾配が1/3を超えるため、奥行を${needed.toFixed(1)}mに伸ばした` });
      total = needed;
    }
    const step = (total - gap * (levels - 1)) / levels;
    if (next.pads.length + levels > 24 || next.paths.length >= 12) return reject('terraces', index, '平場または道の数の上限を超えます');
    // The lowest level lies at the end opposite the rising direction.
    const centre = alongZ ? [t.x, clamp(t.z, gz - (gd - total) / 2 + 0.1, gz + (gd - total) / 2 - 0.1)] : [clamp(t.x, gx - (gw - total) / 2 + 0.1, gx + (gw - total) / 2 - 0.1), t.z];
    const lowCentre = [centre[0] - direction[0] * (total - step) / 2, centre[1] - direction[1] * (total - step) / 2];
    // The terrace is the stated form of this ground: a plaza written over the same area (the model's own flat
    // ground, before it used terraces) is covered by the terrace, would clash with its levels, and is replaced by it.
    const footprint = { x0: centre[0] - (alongZ ? across : total) / 2, x1: centre[0] + (alongZ ? across : total) / 2, z0: centre[1] - (alongZ ? total : across) / 2, z1: centre[1] + (alongZ ? total : across) / 2 };
    const overlapShare = p => { const w = Math.min(p.x + p.width / 2, footprint.x1) - Math.max(p.x - p.width / 2, footprint.x0), d = Math.min(p.z + p.depth / 2, footprint.z1) - Math.max(p.z - p.depth / 2, footprint.z0); return w > 0 && d > 0 ? (w * d) / Math.min(p.width * p.depth, (footprint.x1 - footprint.x0) * (footprint.z1 - footprint.z0)) : 0; };
    const covered = next.pads.filter(p => finite(p.x, p.z, p.width, p.depth) && overlapShare(p) >= 0.5);
    if (covered.length) {
      next.pads = next.pads.filter(p => !covered.includes(p));
      changes.push({ kind: 'padReplacedByTerrace', index, before: covered, reason: `段丘${index + 1}が覆う範囲にあった平場${covered.length}個(${covered.map(p => `(${p.x}, ${p.z}) 高さ${p.height}m`).join('、')})は、段丘に置き換えた` });
    }
    const points = [], floors = [];
    for (let level = 0; level < levels; level++) {
      const offset = level * (step + gap), cx = lowCentre[0] + direction[0] * offset, cz = lowCentre[1] + direction[1] * offset, height = t.height + level * rise;
      const pad = { from: 'terrace', terrace: index, x: +cx.toFixed(2), z: +cz.toFixed(2), width: +(alongZ ? across : step).toFixed(2), depth: +(alongZ ? step : across).toFixed(2), height: +height.toFixed(2) };
      const half = [pad.width / 2, pad.depth / 2];
      // 5 cm of slack for the rounding of the centre that was fitted to the ground
      if (!inside(pad.x - half[0], pad.z - half[1], -0.05) || !inside(pad.x + half[0], pad.z + half[1], -0.05)) return reject('terraces', index, '段が地面の外へ出ます。位置か大きさを内側へ寄せてください');
      next.pads.push(pad);
      points.push({ x: pad.x, z: pad.z, height: pad.height });
      if (viaStairs) {
        // each level has a floor laid flush with its ground: the upper and the lower floor a stair joins
        const floor = { id: fresh(`terrace_${index + 1}_floor_${level + 1}`), name: `段丘${index + 1}の${level + 1}段目の床`, role: 'platform', type: 'box', variant: 1, material: 0, color: '#8c8c7a', designFeature: 'terraceFloor',
          pos: [pad.x, +(pad.height - 0.1).toFixed(2), pad.z], size: [pad.width, 0.2, pad.depth], rot: [0, 0, 0] };
        floors.push(floor); objects.push(floor);
      }
    }
    if (viaStairs) {
      // The terrace is built with its own floors and stairs; the model's own floors laid over the same ground, and the stairs it drew for
      // it (stairs with no floors named, or named for a floor that is now replaced), would be built twice, and are replaced by them.
      const covers = o => { const w = Math.min(o.pos[0] + o.size[0] / 2, footprint.x1) - Math.max(o.pos[0] - o.size[0] / 2, footprint.x0), d = Math.min(o.pos[2] + o.size[2] / 2, footprint.z1) - Math.max(o.pos[2] - o.size[2] / 2, footprint.z0); return w > 0 && d > 0 && (w * d) / (o.size[0] * o.size[2]) >= 0.5; };
      const duplicateFloors = objects.filter(o => o.role === 'platform' && !o.designFeature && Array.isArray(o.pos) && Array.isArray(o.size) && finite(...o.pos, ...o.size) && covers(o));
      const gone = new Set(duplicateFloors.map(o => o.id));
      const duplicateStairs = objects.filter(o => o.role === 'climb' && !o.designFeature && Array.isArray(o.pos) && finite(...o.pos) && o.pos[0] >= footprint.x0 - 2 && o.pos[0] <= footprint.x1 + 2 && o.pos[2] >= footprint.z0 - 2 && o.pos[2] <= footprint.z1 + 2 && ((!o.stairFrom && !o.stairTo) || gone.has(o.stairFrom) || gone.has(o.stairTo)));
      for (const o of [...duplicateFloors, ...duplicateStairs]) objects.splice(objects.indexOf(o), 1);
      for (const o of objects) if (gone.has(o.supportId)) o.supportId = '__generated_terrain';
      if (duplicateFloors.length || duplicateStairs.length) changes.push({ kind: 'objectsReplacedByTerrace', index, before: [...duplicateFloors, ...duplicateStairs].map(o => ({ id: o.id, role: o.role, pos: o.pos, size: o.size })), reason: `段丘${index + 1}(階段でつなぐ)が自分の床と階段を作るため、同じ場所にモデルが置いた足場${duplicateFloors.length}個・階段${duplicateStairs.length}個(${[...duplicateFloors, ...duplicateStairs].map(o => o.id).join('、')})を置き換えた` });
    }
    if (viaStairs) for (let level = 1; level < levels; level++) {
      const lower = floors[level - 1], upper = floors[level], edge = [(lower.pos[0] + upper.pos[0]) / 2, (lower.pos[2] + upper.pos[2]) / 2];
      objects.push({ id: fresh(`terrace_${index + 1}_stairs_${level}`), name: `段丘${index + 1}の階段`, role: 'climb', type: 'box', variant: 1, material: 0, color: '#9a9a8a', designFeature: 'terraceStairs',
        pos: [+edge[0].toFixed(2), +(upper.pos[1] + 0.1 - rise / 2).toFixed(2), +edge[1].toFixed(2)], size: [3, rise, stairLen], rot: [0, 0, 0], stairFrom: lower.id, stairTo: upper.id });
    }
    // A road the model wrote for this terrace as well (all of it lies on the terrace) says the same thing twice: the terrace's own road replaces it.
    const zone = { x0: footprint.x0 - 2, x1: footprint.x1 + 2, z0: footprint.z0 - 2, z1: footprint.z1 + 2 };
    const duplicates = next.paths.filter(path => Array.isArray(path.points) && path.points.length >= 2 && path.points.every(q => finite(q.x, q.z) && q.x >= zone.x0 && q.x <= zone.x1 && q.z >= zone.z0 && q.z <= zone.z1));
    if (duplicates.length) {
      next.paths = next.paths.filter(path => !duplicates.includes(path));
      changes.push({ kind: 'roadDuplicatingTerraceRemoved', index, before: duplicates.map(d => d.points), reason: `段丘${index + 1}の上だけを通る道${duplicates.length}本は、段丘の道と同じものを二重に書いたものだったため、段丘の道に置き換えた` });
    }
    if (!viaStairs) next.paths.push({ width: clamp(Math.min(4, across - 2), 3, 12), points, from: 'terrace' });
    // The terrace owns its ground and its road. Another road of the model's that ends on the terrace is cut where it reaches it; one that
    // runs across it cannot be kept next to the terrace's own heights, and the reason is given to be settled (the road moved or the terrace made smaller).
    const inZone = (q, w) => q.x >= footprint.x0 - w && q.x <= footprint.x1 + w && q.z >= footprint.z0 - w && q.z <= footprint.z1 + w;
    next.paths.forEach((path, k) => {
      if (path.from === 'terrace' || !Array.isArray(path.points) || path.points.length < 2 || !path.points.every(q => finite(q.x, q.z, q.height))) return;
      const w = 0.5, pts = path.points;  // the terrace's own area; a road that only passes near it is left to the height rules
      const sampled = [];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5));
        for (let n = i === 1 ? 0 : 1; n <= steps; n++) sampled.push({ x: a.x + (b.x - a.x) * n / steps, z: a.z + (b.z - a.z) * n / steps, height: a.height + (b.height - a.height) * n / steps, segment: i });
      }
      const flags = sampled.map(q => inZone(q, w));
      if (!flags.some(Boolean)) return;
      const first = flags.indexOf(true), last = flags.lastIndexOf(true), contiguous = flags.slice(first, last + 1).every(Boolean);
      const touchesStart = first === 0, touchesEnd = last === flags.length - 1;
      if (contiguous && (touchesStart !== touchesEnd)) {
        // a tail: cut where the road first reaches the terrace's zone
        const cutAt = touchesEnd ? sampled[first - 1] : sampled[last + 1], keepSegments = touchesEnd ? sampled[first - 1].segment : sampled[last + 1].segment;
        const kept = touchesEnd ? [...pts.slice(0, keepSegments), { x: +cutAt.x.toFixed(2), z: +cutAt.z.toFixed(2), height: +cutAt.height.toFixed(2) }] : [{ x: +cutAt.x.toFixed(2), z: +cutAt.z.toFixed(2), height: +cutAt.height.toFixed(2) }, ...pts.slice(keepSegments)];
        // the new end and the point before it must be at least 0.6 m apart (the terrain keeps no shorter piece of road)
        const endAt = touchesEnd ? kept.length - 1 : 0, nextTo = touchesEnd ? kept.length - 2 : 1;
        if (kept.length > 2 && Math.hypot(kept[endAt].x - kept[nextTo].x, kept[endAt].z - kept[nextTo].z) < 0.6) kept.splice(nextTo, 1);
        const length = kept.slice(1).reduce((sum, q, i) => sum + Math.hypot(q.x - kept[i].x, q.z - kept[i].z), 0);
        if (kept.length >= 2 && length >= 3) {
          changes.push({ kind: 'roadTrimmedAtTerrace', index, pathIndex: k, before: pts.map(q => ({ ...q })), after: kept, reason: `道${k + 1}は段丘${index + 1}の範囲に入り込んでいたため、段丘の手前(${kept[touchesEnd ? kept.length - 1 : 0].x}, ${kept[touchesEnd ? kept.length - 1 : 0].z})までに短くした。段丘の中は段丘の道が通る` });
          path.points = kept;
          return;
        }
      }
      reject('terraces', index, `道${k + 1}が段丘の範囲(${footprint.x0.toFixed(0)}〜${footprint.x1.toFixed(0)}, ${footprint.z0.toFixed(0)}〜${footprint.z1.toFixed(0)})を通り抜けるか、中に折れ点があります。段丘の中は段丘の道が通るので、道を段丘の外へ出すか、段丘の位置・大きさを変えてください`);
    });
    changes.push({ kind: 'terraceBuilt', index, reason: `段丘${index + 1}を${levels}段(段差${rise}m、1段${step.toFixed(1)}m)の平場と、各段をつなぐ${viaStairs ? '階段' : '勾配1/3以下の道'}に展開した`, levels, rise, step: +step.toFixed(2), gap: +gap.toFixed(2) });
  });

  // ---- rivers: water along a line; the channel is cut by the compile where the water lies ----
  rivers.slice(0, FEATURE_LIMITS.rivers).forEach((river, index) => {
    const pts = Array.isArray(river?.points) ? river.points : [];
    if (!river || !finite(river.width) || pts.length < 2 || pts.length > 8 || !pts.every(p => finite(p?.x, p?.z))) return reject('rivers', index, '幅または2〜8点の流路が不正です');
    const width = clamp(river.width, 3, 14);
    if (!pts.every(p => inside(p.x, p.z))) return reject('rivers', index, '流路が地面の外へ出ます');
    // The water surface lies level with the lowest ground on the line (the banks hide water that lies lower), the bed cut below it.
    let level = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z)));
      for (let k = 0; k <= steps; k++) level = Math.min(level, sampleTerrainRelief(next, a.x + (b.x - a.x) * k / steps, a.z + (b.z - a.z) * k / steps));
    }
    level = clamp(level + 0.05, -4.5, 18);  // level with the lowest bank (a hand above it): water lower than the banks is hidden by them from a distance
    // A river that keeps going one way along an axis is one winding strip (the editor's river: a mesh that follows the line, with the
    // rippled, nearly opaque water of a stream). One that doubles back is built as straight pieces.
    const along = key => { const d = pts.slice(1).map((p, i) => p[key] - pts[i][key]); return d.every(v => v > 0.3) || d.every(v => v < -0.3); };
    const axis = along('z') ? 'z' : along('x') ? 'x' : null;
    if (axis) {
      const ordered = [...pts].sort((u, v) => u[axis] - v[axis]), lateralKey = axis === 'z' ? 'x' : 'z';
      const lo = ordered[0][axis], hi = ordered.at(-1)[axis], length = hi - lo, midAlong = (lo + hi) / 2;
      const laterals = ordered.map(p => p[lateralKey]), centreLateral = (Math.min(...laterals) + Math.max(...laterals)) / 2, deviation = Math.max(...laterals.map(v => Math.abs(v - centreLateral)));
      const boxWidth = +Math.max(width * 1.2, 2 * deviation + width + 0.5).toFixed(2), sign = axis === 'z' ? 1 : -1;
      const sections = ordered.map((p, i) => [i === 0 ? -0.5 : i === ordered.length - 1 ? 0.5 : +((p[axis] - midAlong) / length).toFixed(4), +(sign * (p[lateralKey] - centreLateral) / boxWidth).toFixed(4)]);
      objects.push({ id: fresh(`river_${index + 1}`), name: '川', role: 'water', type: 'box', variant: 1, material: 0, color: '#1f6fa8', designFeature: 'river',
        pos: axis === 'z' ? [+centreLateral.toFixed(2), +(level - 0.15).toFixed(2), +midAlong.toFixed(2)] : [+midAlong.toFixed(2), +(level - 0.15).toFixed(2), +centreLateral.toFixed(2)],
        size: [boxWidth, 0.3, +length.toFixed(2)], rot: [0, axis === 'z' ? 0 : +(Math.PI / 2).toFixed(4), 0], riverProfile: { widthRatio: +(width / boxWidth).toFixed(4), sections } });
    } else for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < 0.5) continue;
      const lengthWithJoints = length + (i > 1 ? width / 2 : 0) + (i < pts.length - 1 ? width / 2 : 0);
      const mid = [(a.x + b.x) / 2, (a.z + b.z) / 2], shift = ((i > 1 ? 1 : 0) - (i < pts.length - 1 ? 1 : 0)) * width / 4;
      const unit = [(b.x - a.x) / length, (b.z - a.z) / length];
      objects.push({ id: fresh(`river_${index + 1}_${i}`), name: '川', role: 'water', type: 'box', variant: 1, material: 0, color: '#1f6fa8', designFeature: 'river',
        pos: [+(mid[0] + unit[0] * shift).toFixed(2), +(level - 0.15).toFixed(2), +(mid[1] + unit[1] * shift).toFixed(2)], size: [width, 0.3, +lengthWithJoints.toFixed(2)], rot: [0, +Math.atan2(unit[0], unit[1]).toFixed(4), 0] });
    }
    changes.push({ kind: 'riverBuilt', index, reason: `川${index + 1}を幅${width}m・${pts.length - 1}区間の水路として作り、水面(${level.toFixed(1)}m)の下まで河床を掘る`, level: +level.toFixed(2) });
  });

  // ---- formations: tall rock (the cliff mesh scaled up), standing on the ground ----
  formations.slice(0, FEATURE_LIMITS.formations).forEach((f, index) => {
    if (!f || !finite(f.x, f.z, f.count, f.height, f.spread)) return reject('formations', index, '数値が不正です');
    const count = clamp(Math.round(f.count), 1, 8), height = clamp(f.height, 4, 26), spread = clamp(f.spread, 0, 30), random = rng(Math.round(f.x * 131 + f.z * 71 + count * 17 + height * 7));
    const placed = [], model = getModelDefault('cliff', 1);
    if (!model) return reject('formations', index, '岩壁のモデルがありません');
    // Rock stands only on ground that is free: not on a road, a plaza (terrace levels included) or water, nor on another rock.
    const clearOf = (x, z, w, d) => {
      const reach = Math.max(w, d) * 0.4;
      for (const path of next.paths) {
        const pts = path.points || [];
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i], l2 = (b.x - a.x) ** 2 + (b.z - a.z) ** 2 || 1, t = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)) / l2));
          if (Math.hypot(x - a.x - t * (b.x - a.x), z - a.z - t * (b.z - a.z)) < reach + (path.width || 4) / 2 + 0.8) return false;
        }
      }
      if (next.pads.some(p => Math.abs(x - p.x) < w / 2 + p.width / 2 + 1.5 && Math.abs(z - p.z) < d / 2 + p.depth / 2 + 1.5)) return false;
      if (objects.some(o => o.role === 'water' && Math.abs(x - o.pos[0]) < Math.max(o.size[0], o.size[2]) / 2 + w / 2 && Math.abs(z - o.pos[2]) < Math.max(o.size[0], o.size[2]) / 2 + d / 2 && (() => { const yaw = o.rot?.[1] || 0, dx = x - o.pos[0], dz = z - o.pos[2]; return Math.abs(Math.cos(yaw) * dx - Math.sin(yaw) * dz) < o.size[0] / 2 + reach && Math.abs(Math.sin(yaw) * dx + Math.cos(yaw) * dz) < o.size[2] / 2 + reach; })())) return false;
      return !placed.some(q => Math.abs(x - q.pos[0]) < (w + q.size[0]) / 2 * 0.6 && Math.abs(z - q.pos[2]) < (d + q.size[2]) / 2 * 0.6);
    };
    for (let k = 0; k < count; k++) {
      const share = count === 1 ? 0 : (k / (count - 1)) * 2 - 1;
      let x, z, h, w, d, ok = false;
      for (let attempt = 0; attempt < 8 && !ok; attempt++) {
        x = f.x + share * spread + (random() - 0.5) * (2 + attempt * 2); z = f.z + (random() - 0.5) * Math.max(2, spread / 3) * (1 + attempt * 0.5);
        h = height * (0.65 + random() * 0.5); w = h * (0.7 + random() * 0.3); d = h * (0.5 + random() * 0.3);
        ok = inside(x, z, Math.max(w, d) / 2 + 0.5) && clearOf(x, z, w, d);
      }
      if (!ok) continue;
      placed.push({ id: fresh(`formation_${index + 1}_${k + 1}`), name: '岩の塔', role: 'cliff', type: 'box', variant: 1, material: 0, designFeature: 'formation',
        color: typeof f.color === 'string' && /^#[0-9a-f]{6}$/i.test(f.color) ? f.color : '#5b5f63', pos: [+x.toFixed(2), 0, +z.toFixed(2)], size: [+w.toFixed(2), +h.toFixed(2), +d.toFixed(2)], rot: [0, +(random() * Math.PI * 2).toFixed(3), 0], modelDimensions: { path: model.path, size: [...model.bounds.size], defaultScale: model.scale } });
    }
    if (!placed.length) return reject('formations', index, '地面の内側に1つも置けません(位置か広がりを内側へ)');
    objects.push(...placed);
    changes.push({ kind: 'formationBuilt', index, reason: `岩の群れ${index + 1}として高さ約${height}mの岩壁を${placed.length}個、(${f.x}, ${f.z})付近に置いた`, count: placed.length });
  });

  next.featuresExpanded = true;
  return { draft: { ...draft, objects, terrainDesign: next, designFeatureUnbuilt: [...(draft.designFeatureUnbuilt || []), ...unbuilt] }, changes, unbuilt };
}

// The design as the model wrote it: without the floors, stairs, water and rock built from its rivers, terraces and
// formations, and without the levels and roads a terrace laid out. Expanding the result again rebuilds the same features.
export function withoutExpandedFeatures(draft) {
  const design = draft?.terrainDesign;
  if (design?.featuresExpanded !== true || !Array.isArray(draft.objects)) return draft;
  const { featuresExpanded: _expanded, ...own } = design;
  return { ...draft, objects: draft.objects.filter(o => !o?.designFeature),
    terrainDesign: { ...own, ...(Array.isArray(own.pads) ? { pads: own.pads.filter(p => p?.from !== 'terrace') } : {}), ...(Array.isArray(own.paths) ? { paths: own.paths.filter(p => p?.from !== 'terrace') } : {}) } };
}

// Rock standing on the compiled ground: each sits on the lowest ground under it and sinks a little into it.
export function seatFormations(objects, terrain, surfaceTop) {
  return objects.map(o => {
    if (o.designFeature !== 'formation') return o;
    let low = Infinity;
    for (const [sx, sz] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const y = surfaceTop(terrain, o.pos[0] + sx * o.size[0] * 0.3, o.pos[2] + sz * o.size[2] * 0.3);
      if (Number.isFinite(y)) low = Math.min(low, y);
    }
    if (!Number.isFinite(low)) return o;
    return { ...o, pos: [o.pos[0], +(low - 1 + o.size[1] / 2).toFixed(2), o.pos[2]] };
  });
}

// A road that runs straight through a bridge is not a road across water: the deck is the way over, the road under it would
// be held at the road's height in the middle of the river (and walked into the deck). Where a road crosses a bridge, the road
// ends at each end of the bridge and the bridge carries it: the road is split into the two pieces on the banks (the bridge
// is a floor of its own), each piece keeping its points and heights. The pieces still count as the one road the model drew.
export function splitRoadsAtBridges(draft) {
  const design = draft?.terrainDesign;
  if (design?.enabled !== true || !Array.isArray(design.paths) || !Array.isArray(draft.objects)) return { draft, changes: [] };
  // (The roads are counted as the model drew them: the pieces a bridge splits a road into are still that one road, see terrainFeatureCount.)
  const bridges = draft.objects.filter(o => o?.role === 'bridge' && o.type !== 'spline' && Array.isArray(o.pos) && Array.isArray(o.size) && [...o.pos, ...o.size].every(Number.isFinite) && !(o.rot || []).some((v, i) => i !== 1 && v));
  if (!bridges.length) return { draft, changes: [] };
  const inside = (b, x, z, m = 0) => {
    const yaw = b.rot?.[1] || 0, dx = x - b.pos[0], dz = z - b.pos[2];
    const lx = Math.cos(yaw) * dx - Math.sin(yaw) * dz, lz = Math.sin(yaw) * dx + Math.cos(yaw) * dz;
    return Math.abs(lx) <= b.size[0] / 2 + m && Math.abs(lz) <= b.size[2] / 2 + m;
  };
  const next = structuredClone(design), changes = [];
  const result = [];
  for (const [index, path] of next.paths.entries()) {
    if (path.from === 'terrace' || !Array.isArray(path.points) || path.points.length < 2 || !path.points.every(q => finite(q.x, q.z, q.height))) { result.push(path); continue; }
    let pieces = [path.points];
    for (const b of bridges) {
      const cut = [];
      for (const piece of pieces) {
        // walk the piece; the samples inside the bridge are the stretch the bridge carries
        const sampled = [];
        for (let i = 1; i < piece.length; i++) {
          const a = piece[i - 1], c = piece[i], steps = Math.max(1, Math.ceil(Math.hypot(c.x - a.x, c.z - a.z) / 0.25));
          for (let n = i === 1 ? 0 : 1; n <= steps; n++) sampled.push({ x: a.x + (c.x - a.x) * n / steps, z: a.z + (c.z - a.z) * n / steps, height: a.height + (c.height - a.height) * n / steps, segment: i });
        }
        const flags = sampled.map(q => inside(b, q.x, q.z));
        const first = flags.indexOf(true), last = flags.lastIndexOf(true);
        if (first < 0) { cut.push(piece); continue; }
        const usablePiece = pts => pts.length >= 2 && pts.slice(1).reduce((sum, q, i) => sum + Math.hypot(q.x - pts[i].x, q.z - pts[i].z), 0) >= 1;
        const edgePoint = q => ({ x: +q.x.toFixed(2), z: +q.z.toFixed(2), height: +q.height.toFixed(2) });
        // a road that ends on the bridge ends where the bridge begins
        if (last === flags.length - 1 && first > 0) {
          const before = sampled[first - 1], left = [...piece.slice(0, before.segment), edgePoint(before)];
          if (usablePiece(left)) { cut.push(left); changes.push({ kind: 'roadSplitAtBridge', pathIndex: index, objectId: b.id, before: piece.map(q => ({ ...q })), reason: `道${index + 1}の終わりが橋${b.id}の上にあったため、橋の手前で終わらせた（橋が先をつなぐ）` }); } else cut.push(piece);
          continue;
        }
        if (first === 0 && last < flags.length - 1) {
          const after = sampled[last + 1], right = [edgePoint(after), ...piece.slice(after.segment)];
          if (usablePiece(right)) { cut.push(right); changes.push({ kind: 'roadSplitAtBridge', pathIndex: index, objectId: b.id, before: piece.map(q => ({ ...q })), reason: `道${index + 1}の始まりが橋${b.id}の上にあったため、橋の先から始めた（橋が手前をつなぐ）` }); } else cut.push(piece);
          continue;
        }
        if (first === 0 && last === flags.length - 1) { cut.push(piece); continue; }  // wholly on the bridge: left as it is
        const before = sampled[first - 1], after = sampled[last + 1];
        const left = [...piece.slice(0, before.segment), { x: +before.x.toFixed(2), z: +before.z.toFixed(2), height: +before.height.toFixed(2) }];
        const right = [{ x: +after.x.toFixed(2), z: +after.z.toFixed(2), height: +after.height.toFixed(2) }, ...piece.slice(after.segment)];
        const usable = pts => pts.length >= 2 && pts.slice(1).reduce((sum, q, i) => sum + Math.hypot(q.x - pts[i].x, q.z - pts[i].z), 0) >= 1;
        for (const part of [left, right]) {
          // no piece of road shorter than 0.6 m between two points
          const trimmed = part.filter((q, i) => i === 0 || i === part.length - 1 || (Math.hypot(q.x - part[i - 1].x, q.z - part[i - 1].z) >= 0.6 && Math.hypot(q.x - part[i + 1].x, q.z - part[i + 1].z) >= 0.6));
          if (usable(trimmed)) cut.push(trimmed);
        }
        changes.push({ kind: 'roadSplitAtBridge', pathIndex: index, objectId: b.id, before: piece.map(q => ({ ...q })), reason: `道${index + 1}が橋${b.id}の上を通っていたため、橋の両端で道を2つに分けた（橋が両岸をつなぐ。道の点・高さ・幅は変更なし）` });
      }
      pieces = cut;
    }
    pieces.forEach(points => result.push(pieces.length > 1 || changes.some(c => c.pathIndex === index) ? { ...path, points, origin: path.origin ?? index } : { ...path, points }));
  }
  if (!changes.length) return { draft, changes: [] };
  next.paths = result;
  return { draft: { ...draft, terrainDesign: next }, changes };
}

// A bridge crosses a river: one lying along it is turned across it (a quarter turn), wherever the river bends. The model draws the
// bridge's long side along the stream surprisingly often; with the bridge parallel to the water it joins nothing, and the road
// meant for it runs on through the channel. Judged on the draft, before the terrain is built, so the roads, the heights and the
// carving of the channel all see the bridge where it will stand.
export function orientBridges(draft) {
  if (draft?.terrainDesign?.enabled !== true || !Array.isArray(draft.objects)) return { draft, changes: [] };
  const waters = draft.objects.filter(o => o?.role === 'water' && o.type === 'box' && Array.isArray(o.pos) && Array.isArray(o.size) && [...o.pos, ...o.size].every(Number.isFinite));
  const changes = [];
  const objects = draft.objects.map(o => {
    if (o?.role !== 'bridge' || o.type === 'spline' || !Array.isArray(o.pos) || !Array.isArray(o.size) || [...o.pos, ...o.size].some(v => !Number.isFinite(v)) || (o.rot || []).some((v, i) => i !== 1 && v)) return o;
    const yaw = o.rot?.[1] || 0, long = o.size[0] >= o.size[2] ? [Math.cos(yaw), -Math.sin(yaw)] : [Math.sin(yaw), Math.cos(yaw)];
    for (const w of waters) {
      const wy = w.rot?.[1] || 0;
      // inside the water itself (a winding river is narrower than the box that holds it)
      if (!footprintContains(w, o.pos[0], o.pos[2])) continue;
      const waterLong = w.size[2] >= w.size[0] ? [Math.sin(wy), Math.cos(wy)] : [Math.cos(wy), -Math.sin(wy)];
      const parallel = Math.abs(long[0] * waterLong[0] + long[1] * waterLong[1]);
      const waterWidth = w.riverProfile ? w.size[0] * w.riverProfile.widthRatio : Math.min(w.size[0], w.size[2]);
      if (parallel < Math.cos(Math.PI / 6) || Math.max(o.size[0], o.size[2]) <= waterWidth + 0.5) continue;
      const turned = [...(o.rot || [0, 0, 0])]; turned[1] = +(yaw + Math.PI / 2).toFixed(4);
      changes.push({ kind: 'bridgeTurnedAcrossRiver', objectId: o.id, before: yaw, after: turned[1], reason: `橋${o.id}は川に沿って水の上に置かれていたため、川を渡る向きへ90度回した（位置・大きさ・個数は変更なし）` });
      return { ...o, rot: turned };
    }
    return o;
  });
  return changes.length ? { draft: { ...draft, objects }, changes } : { draft, changes: [] };
}

// A road that crosses a river with nothing to cross on is a road through the water. Where a road meets a river and no bridge
// covers the crossing, a bridge is laid across it (along the road, as wide as the road, reaching two metres past the water on each
// bank); the road is then split at its ends by splitRoadsAtBridges. Not where the request wants no bridges.
export function bridgeRoadsOverRivers(draft, brief = null) {
  const design = draft?.terrainDesign;
  if (design?.enabled !== true || !Array.isArray(design.paths) || !Array.isArray(draft.objects)) return { draft, changes: [] };
  if ((brief?.requirements || []).some(r => r.kind === 'count' && (r.role === 'bridge' || r.targetRole === 'bridge') && r.comparison !== 'atLeast' && Number(r.value) === 0)) return { draft, changes: [] };
  const waters = draft.objects.filter(o => o?.role === 'water' && o.type === 'box' && Array.isArray(o.pos) && Array.isArray(o.size) && [...o.pos, ...o.size].every(Number.isFinite));
  if (!waters.length) return { draft, changes: [] };
  const inWater = (x, z) => waters.some(w => footprintContains(w, x, z));
  const bridges = draft.objects.filter(o => o?.role === 'bridge' && Array.isArray(o.pos) && Array.isArray(o.size));
  const covered = (x, z) => bridges.some(b => { const yaw = b.rot?.[1] || 0, dx = x - b.pos[0], dz = z - b.pos[2]; return Math.abs(Math.cos(yaw) * dx - Math.sin(yaw) * dz) <= b.size[0] / 2 + 1 && Math.abs(Math.sin(yaw) * dx + Math.cos(yaw) * dz) <= b.size[2] / 2 + 1; });
  const used = new Set(draft.objects.map(o => o.id)), added = [], changes = [];
  const fresh = base => { let id = base, n = 1; while (used.has(id)) id = `${base}_${n++}`; used.add(id); return id; };
  for (const [index, path] of design.paths.entries()) {
    if (!Array.isArray(path.points) || path.points.length < 2 || !path.points.every(q => finite(q.x, q.z, q.height))) continue;
    let crossing = null;
    for (let i = 1; i < path.points.length; i++) {
      const a = path.points[i - 1], b = path.points[i], length = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.max(1, Math.ceil(length / 0.25));
      for (let n = 0; n <= steps; n++) {
        const x = a.x + (b.x - a.x) * n / steps, z = a.z + (b.z - a.z) * n / steps, wet = inWater(x, z) && !covered(x, z);
        if (wet) { crossing ??= { from: n, to: n, a, b, steps, length }; crossing.to = n; }
        else if (crossing) { break; }
      }
      if (crossing) break;
    }
    if (!crossing) continue;
    const { a, b, steps, length } = crossing, unit = [(b.x - a.x) / length, (b.z - a.z) / length];
    const start = crossing.from / steps * length, end = crossing.to / steps * length, reach = Math.max(6, end - start + 4);
    const mid = (start + end) / 2, x = a.x + unit[0] * mid, z = a.z + unit[1] * mid, yaw = Math.atan2(unit[0], unit[1]);
    added.push({ id: fresh('bridge_auto'), name: '橋', role: 'bridge', type: 'box', variant: 1, material: 0, supportId: '__generated_terrain', designFeature: 'roadBridge',
      pos: [+x.toFixed(2), 0, +z.toFixed(2)], size: [Math.min(Math.max(path.width || 4, 3), 6), 0.4, +reach.toFixed(2)], rot: [0, +yaw.toFixed(4), 0] });
    changes.push({ kind: 'bridgeAddedOverRiver', pathIndex: index, reason: `道${index + 1}が川の水の上を通っていて橋が無かったため、道に沿って橋(長さ${reach.toFixed(1)}m)を足した` });
  }
  return added.length ? { draft: { ...draft, objects: [...draft.objects, ...added] }, changes } : { draft, changes: [] };
}

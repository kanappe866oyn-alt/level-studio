import { getModelDefault } from './modelCatalog.js';
import { sampleTerrain } from './terrainSurface.js';
import { natureTint } from './natureDressing.js';

const box = (id, name, role, pos, size, color) => ({ id, name, role, type: 'box', pos, size, rot: [0, 0, 0], color, variant: 1, material: 0 });
export const NATURE_PAVING_RISE = 0.08;

// Small paved destinations sit on the reserved flat axes. Features stay beside the route.
export function buildNaturePlace(land, plan, side, level) {
  if (!((side === 0 && level === 0) || level === 1 || (side === 1 && level === 2))) return [];
  const [width, , depth] = land.size, [x, , z] = land.pos;
  const y = land.pos[1] + land.size[1] / 2;
  const offset = level === 0 ? depth / 4 : level === 2 ? -depth / 4 : 0;
  const plazaWidth = level === 1 ? Math.min(7.2, width * 0.3) : 3.6;
  const plazaDepth = level === 1 ? 4.4 : 3.6;
  const label = ['入口の小広場', '木立の休憩広場', '高台の展望広場'][level];
  const color = natureTint(plan.rockColor, [0.22, 0.13, 0.28][level]);
  const top = y + NATURE_PAVING_RISE;
  const objects = [box(`${land.id}_plaza`, label, 'corridor', [x, top - 0.06, z + offset], [plazaWidth, 0.12, plazaDepth], color)];
  if (offset !== 0) {
    const approachLength = Math.abs(offset) - plazaDepth / 2;
    objects.push(box(`${land.id}_approach`, '橋から広場へ続く石の小道', 'corridor',
      [x, top - 0.06, z + Math.sign(offset) * approachLength / 2], [1.8, 0.12, approachLength], color));
  }
  if (level === 0) {
    for (const sign of [-1, 1]) {
      const px = x + sign * 1.55, pz = z + offset + plazaDepth / 2 - 0.5;
      objects.push(box(`${land.id}_entry_post_${sign}`, '入口を示す石柱', 'wall', [px, top + 0.8, pz], [0.4, 1.6, 0.4], plan.rockColor));
      objects.push(box(`${land.id}_entry_cap_${sign}`, '入口の石柱の笠石', 'wall', [px, top + 1.68, pz], [0.6, 0.16, 0.6], color));
    }
  } else if (level === 1) {
    for (const sign of [-1, 1]) objects.push(box(`${land.id}_seat_${sign}`, '広場脇の石の腰掛け', 'wall',
      [x + sign * (plazaWidth / 2 - 0.65), top + 0.225, z + sign * 1.5], [0.8, 0.45, 0.65], color));
  } else {
    // Low stone edges mark the plaza without closing the longitudinal walking axis.
    // Side openings also leave access toward the tower's separate base.
    for (const side of [-1, 1]) for (const end of [-1, 1]) objects.push(box(`${land.id}_curb_${side}_${end}`, '展望広場の石の縁取り', 'wall',
      [x + side * (plazaWidth / 2 - 0.14), top + 0.12, z + offset + end * 1.2], [0.18, 0.24, 1.2], color));
    // A tall, narrow shipped model can be seen from the opposite bank.
    const px = x + 3.2, pz = z + offset;
    const groundSamples = [-1, 0, 1].flatMap(dx => [-1, 0, 1].map(dz => sampleTerrain(land, px - x + dx * 1.1, offset + dz * 1.1)));
    if (groundSamples.some(v => v === null)) throw new Error('展望広場の目印を支持する地形がありません。');
    const bottom = land.pos[1] + Math.min(...groundSamples) - 0.04;
    objects.push(box(`${land.id}_landmark_base`, '展望塔の石の台座', 'corridor', [px, (top + bottom) / 2, pz], [2.2, Math.max(0.12, top - bottom), 2.2], color));
    // Preserve the top when a very flat terrain needs the minimum thickness.
    const base = objects.at(-1); base.pos[1] = top - base.size[1] / 2;
    const ref = getModelDefault('landmark', 2), size = ref.size.map(v => v * 5.7 / ref.size[1]);
    objects.push({ ...box(`${land.id}_landmark`, '対岸からも見える展望塔', 'landmark', [px, top + size[1] / 2, pz], size, plan.rockColor), variant: 2,
      modelDimensions: { path: ref.path, size: [...ref.bounds.size], defaultScale: ref.scale } });
  }
  return objects;
}

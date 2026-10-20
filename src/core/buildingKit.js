import ENTRIES from '../data/building_entries.json' with { type: 'json' };
import { getModelDefault } from './modelCatalog.js';

export const BUILDING_SIDES = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
export function buildingKit(variant) {
  const entry = ENTRIES[variant], ref = getModelDefault('building', variant);
  if (!entry || !ref || entry.size.some((v, i) => Math.abs(v - ref.size[i]) > 1e-5)) throw new Error('建物の寸法・入口の登録を更新してください。');
  return { ...entry, ref };
}
// One shared forecourt serves a bounded row of native, unscaled buildings.
export function buildingPlotLayout(plot, area) {
  const kit = buildingKit(plot.variant), [nx, nz] = BUILDING_SIDES[plot.side];
  const variants = plot.variants || Array(plot.count ?? 1).fill(plot.variant), count = variants.length;
  const setbacks = plot.setbacks || variants.map(() => 0);
  const kits = variants.map(buildingKit), depth = Math.max(...kits.map((k, i) => k.size[2] + setbacks[i]));
  const uniform = variants.every(v => v === variants[0]);
  const frontage = uniform ? count * kits[0].size[0] + (count - 1) * 1.5 : kits.reduce((sum, k) => sum + k.size[0], 0) + (count - 1) * 1.5;
  const yaw = Math.atan2(-nx, -nz) || 0, radius = nx ? area.width / 2 : area.depth / 2;
  const lot = [frontage + 2, depth + 2], approachLength = plot.approachLength ?? 5;
  const distance = radius + approachLength + lot[1] / 2, x = area.x + nx * distance, z = area.z + nz * distance;
  const root = `sp_build_${plot.id}`;
  let cursor = -frontage / 2;
  const units = kits.map((unitKit, i) => {
    const offset = uniform ? (i - (count - 1) / 2) * (unitKit.size[0] + 1.5) : cursor + unitKit.size[0] / 2;
    cursor += unitKit.size[0] + 1.5;
    // Align the native front bounds so the shared street clears every entrance.
    const localZ = (depth - unitKit.size[2]) / 2 - setbacks[i];
    return { root: count === 1 ? root : `${root}_unit_${i + 1}`, id: count === 1 ? plot.id : `${plot.id}_unit_${i + 1}`,
      x: x + Math.cos(yaw) * offset + Math.sin(yaw) * localZ, z: z - Math.sin(yaw) * offset + Math.cos(yaw) * localZ,
      offset, localZ, kit: unitKit, variant: variants[i] };
  });
  return { kit, nx, nz, yaw, radius, approachLength, lot, x, z, root, units };
}
export function validateBuildingPlacement(value, object) {
  if (!value || object.role !== 'building' || !ENTRIES[object.variant] || !/^[a-z][a-z0-9_]{0,30}$/.test(value.plotId) || !/^[a-z][a-z0-9_]{0,30}$/.test(value.from) || !Object.hasOwn(BUILDING_SIDES, value.side)) throw new Error('建物の平場・入口の設定が不正です。');
  return { plotId: value.plotId, from: value.from, side: value.side };
}
export function scaledBuildingEntry(object) {
  const kit = buildingKit(object.variant), scale = object.size.map((v, i) => v / kit.size[i]);
  return { doorX: kit.doorX * scale[0], front: kit.collisionFront * scale[2], overhangBottom: kit.overhangBottom * scale[1],
    ramp: { x: kit.ramp.x * scale[0], width: kit.ramp.width * scale[0], near: kit.ramp.near * scale[2], far: kit.ramp.far * scale[2], height: kit.ramp.height * scale[1] } };
}

import { surfaceTop } from './spatialGeometry.js';
import { TERRAIN_DISTRICTS } from './terrainMaterials.js';

// Small open-front shelters use the existing paving: no extra walking floor,
// steps or invisible collision proxy. The front opens towards the court.
export function terraceRestGroups(area, floor, half) {
  if (area.kind !== 'courtyard' || area.width < 12 || area.depth < 12) return [];
  const groups = [], palette = TERRAIN_DISTRICTS.high, alongX = area.width >= area.depth;
  for (const [sx, sz] of [[-1, -1], [1, 1], [-1, 1], [1, -1]]) {
    const u = sx * (half + 1.45), v = sz * (half + 0.8);
    const x = area.x + (alongX ? u : v), z = area.z + (alongX ? v : u);
    const y = surfaceTop(floor, x, z) ?? area.y;
    const id = `sp_plaza_street_rest_${area.id}_${sx < 0 ? 'w' : 'e'}${sz < 0 ? 'n' : 's'}`;
    const part = (suffix, label, dx, dz, h, width, depth, height, surface, color) => ({
      id: `${id}_${suffix}`, name: `${area.name}の休憩所${label}`, role: 'wall', type: 'box', variant: 1, material: 1,
      pos: [x + (alongX ? dx : dz), y + h, z + (alongX ? dz : dx)],
      size: alongX ? [width, height, depth] : [depth, height, width], rot: [0, 0, 0], color,
      spatialAppearance: { version: 1, style: 'harbor', surface, district: 'high', category: 'trim', moduleId: id.slice(3), areaId: area.id },
    });
    const parts = [];
    for (const dx of [-1.05, 1.05]) for (const dz of [-0.6, 0.6]) {
      parts.push(part(`leg_${dx}_${dz}`, 'の柱脚', dx, dz, 0.15, 0.22, 0.22, 0.3, 'concrete', palette.foot));
      parts.push(part(`post_${dx}_${dz}`, 'の柱', dx, dz, 1.45, 0.14, 0.14, 2.3, 'wood', '#684d39'));
    }
    parts.push(part('back', 'の背板', 0, sz * 0.6, 1.18, 2.1, 0.14, 2.06, 'wood', '#886344'));
    parts.push(part('seat', 'の腰掛け', 0, sz * 0.35, 0.47, 1.9, 0.48, 0.14, 'wood', '#886344'));
    for (const dx of [-0.7, 0.7]) parts.push(part(`leg_seat_${dx}`, 'の腰掛け脚', dx, sz * 0.35, 0.2, 0.16, 0.36, 0.4, 'wood', '#684d39'));
    for (const dz of [-0.6, 0.6]) parts.push(part(`beam_${dz}`, 'の梁', 0, dz, 2.62, 2.5, 0.18, 0.18, 'wood', '#684d39'));
    // Solid roof has real head clearance; fascia and ribs give it readable depth.
    parts.push(part('roof', 'の屋根', 0, 0, 2.83, 2.7, 1.9, 0.18, 'wood', palette.crown));
    for (const dx of [-1.28, 1.28]) parts.push(part(`roof_edge_${dx}`, 'の屋根縁', dx, 0, 2.93, 0.14, 1.95, 0.12, 'wood', '#684d39'));
    groups.push({ id, parts, bench: true, street: true, rest: true });
  }
  return groups;
}

// A shallow stall leaves the full through-route open even on an 8m street.
// Only the canopy projects above that route; its underside is above headroom.
export function streetMarketGroups(area, floor, half) {
  const alongX = area.width >= area.depth, length = Math.max(area.width, area.depth), depth = Math.min(area.width, area.depth);
  if (area.kind !== 'courtyard' || length < 18 || length / depth < 2 || depth > 12) return [];
  const district = area.level > 0 ? 'high' : 'court', palette = TERRAIN_DISTRICTS[district];
  const groups = [];
  for (const side of [-1, 1]) for (const end of [-1, 1]) {
    const along = end * Math.max(length / 4, half + 2.1), across = side * (depth / 2 - 0.5);
    const x = area.x + (alongX ? along : across), z = area.z + (alongX ? across : along);
    const y = surfaceTop(floor, x, z) ?? area.y;
    const id = `sp_plaza_street_${area.id}_${side < 0 ? 'n' : 's'}${end < 0 ? 'w' : 'e'}`;
    const part = (suffix, name, u, v, h, width, thickness, height, surface, color) => ({
      id: `${id}_${suffix}`, name: `${area.name}の売店${name}`, role: 'wall', type: 'box', variant: 1, material: 1,
      pos: [x + (alongX ? u : v), y + h, z + (alongX ? v : u)],
      size: alongX ? [width, height, thickness] : [thickness, height, width], rot: [0, 0, 0], color,
      spatialAppearance: { version: 1, style: 'harbor', surface, district, category: 'trim', moduleId: id.slice(3), areaId: area.id },
    });
    const parts = [
      part('rim_counter', 'の腰板', 0, 0, 0.475, 3, 0.6, 0.95, 'wood', '#886344'),
      part('counter_top', 'の天板', 0, 0, 1.01, 3.1, 0.7, 0.12, 'wood', '#684d39'),
    ];
    for (const u of [-1, 1]) for (const v of [-1, 1]) {
      parts.push(part(`leg_${u}_${v}`, 'の柱脚', u * 1.45, v * 0.25, 0.15, 0.22, 0.22, 0.3, 'concrete', palette.foot));
      parts.push(part(`post_${u}_${v}`, 'の柱', u * 1.45, v * 0.25, 1.5, 0.12, 0.12, 2.4, 'wood', '#684d39'));
    }
    for (const v of [-1, 1]) parts.push(part(`beam_${v}`, 'の横梁', 0, v * 0.25, 2.62, 3.2, 0.16, 0.16, 'wood', '#684d39'));
    for (let i = 0; i < 5; i++) {
      const color = i % 2 ? '#dfd1b3' : palette.crown;
      parts.push(part(`awning_${i}`, 'の日よけ', (i - 2) * 0.64, 0, 2.76, 0.64, 1.25, 0.12, 'stucco', color));
      parts.push(part(`valance_${i}`, 'の日よけの縁', (i - 2) * 0.64, -side * 0.57, 2.57, 0.64, 0.1, 0.26, 'stucco', color));
    }
    groups.push({ id, parts, bench: false, street: true });
  }
  return groups;
}

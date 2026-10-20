import { getBounds, worldXZ } from './spatialGeometry.js';
import { spatialArchitectureModules } from './spatialArchitecture.js';
import { spatialCornerInset } from './spatialPlan.js';

export const SPATIAL_FINISH_STYLE = 'harbor';
export const SPATIAL_SURFACES = ['paving', 'stucco', 'brick', 'metal', 'wood', 'concrete', 'facade', 'sign', 'facade-market', 'facade-arcade', 'facade-warehouse'];
export function validateSpatialAppearance(value) {
  if (!value || value.version !== 1 || value.style !== SPATIAL_FINISH_STYLE || !SPATIAL_SURFACES.includes(value.surface) || !['court', 'high', 'lane', 'entry', 'neutral'].includes(value.district) || !['structure', 'trim', 'support', 'backdrop', 'roof', 'portal', 'sign', 'foundation', 'building'].includes(value.category)) throw new Error('立体マップの外観設定が不正です。');
  if (value.label !== undefined && (typeof value.label !== 'string' || value.label.length > 48)) throw new Error('立体マップの表示名が不正です。');
  if (value.areaId !== undefined && (typeof value.areaId !== 'string' || !/^[a-z][a-z0-9_]{0,30}$/.test(value.areaId))) throw new Error('外観部材の対象エリアが不正です。');
  if (value.moduleId !== undefined && (typeof value.moduleId !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(value.moduleId))) throw new Error('建築部材の組み合わせが不正です。');
  if (value.edgeTrim !== undefined && typeof value.edgeTrim !== 'boolean') throw new Error('壁の仕上げ設定が不正です。');
  if (value.railing !== undefined && typeof value.railing !== 'boolean') throw new Error('手すりの仕上げ設定が不正です。');
  if (value.railingAxis !== undefined && (!value.railing || !['x', 'z'].includes(value.railingAxis))) throw new Error('手すりの方向設定が不正です。');
  return { version: 1, style: value.style, surface: value.surface, district: value.district, category: value.category, ...(value.label ? { label: value.label } : {}), ...(value.areaId ? { areaId: value.areaId } : {}), ...(value.moduleId ? { moduleId: value.moduleId } : {}), ...(value.edgeTrim !== undefined ? { edgeTrim: value.edgeTrim } : {}), ...(value.railing !== undefined ? { railing: value.railing } : {}), ...(value.railingAxis ? { railingAxis: value.railingAxis } : {}) };
}
const palette = {
  court: { floor: '#ccb991', wall: '#e3d0ad', accent: '#aa7a43', surface: 'paving' },
  high: { floor: '#9ba6a1', wall: '#397b83', accent: '#d5af64', surface: 'wood' },
  lane: { floor: '#b69c87', wall: '#bd8061', accent: '#557c81', surface: 'paving' },
  entry: { floor: '#c5c7b8', wall: '#ddd3ba', accent: '#357d84', surface: 'paving' },
  neutral: { floor: '#a7aba5', wall: '#acb5af', accent: '#596f79', surface: 'concrete' },
};
const floorColors = { entry: '#99b7c7', courtyard: '#d4bc8f', high: '#6f9b9e', goal: '#d5a060' };

// Labels are painted into the existing floor material, never added as a collider.
export function spatialLabelKind(object) {
  const a = object.spatialAppearance;
  if (!a?.label) return null;
  if (a.category === 'sign' || (a.category === 'building' && a.moduleId && object.role === 'wall')) return 'sign';
  return object.role === 'bridge' && object.id.startsWith('sp_area_') ? 'floor' : null;
}
const districtFor = a => a?.kind === 'high' || a?.level > 0 ? 'high' : a?.enclosure === 'walled' ? 'lane' : a?.kind === 'courtyard' ? 'court' : ['entry', 'goal'].includes(a?.kind) ? 'entry' : 'neutral';
const appearance = (surface, district, category = 'structure', label) => ({ version: 1, style: SPATIAL_FINISH_STYLE, surface, district, category, ...(label ? { label } : {}) });
const box = (id, name, pos, size, color, surface, district, category, yaw = 0) => ({ id, name, role: 'wall', type: 'box', pos, size, rot: [0, yaw, 0], color, variant: 1, material: 0, spatialAppearance: appearance(surface, district, category) });

// Deterministic, tileable greyscale data, tinted by the district's material color.
// No downloaded assets or random state; UVs are in metres, independent of size.
export function spatialTexturePixels(surface, resolution = 128) {
  if (!SPATIAL_SURFACES.includes(surface) || !Number.isInteger(resolution) || resolution < 16 || resolution > 256) throw new Error('外観テクスチャの指定が不正です。');
  const bytes = new Uint8Array(resolution * resolution * 4);
  for (let y = 0; y < resolution; y++) for (let x = 0; x < resolution; x++) {
    const u = x / resolution, v = y / resolution;
    const noise = ((x * 73 + y * 151 + x * y * 13) % 29) / 29;
    let value = 239 + noise * 12;
    const joint = (t, period, width) => (t * period) % 1 < width;
    if (surface === 'paving') {
      const row = Math.floor(v * 4), col = Math.floor(u * 4 + (row % 2) * 0.5);
      value = joint(v, 4, 0.035) || joint(u + (row % 2) / 8, 4, 0.035) ? 162 : 225 + ((row * 7 + col * 3) % 5) * 4 + noise * 6;
    } else if (surface === 'brick') {
      const row = Math.floor(v * 10);
      value = joint(v, 10, 0.075) || joint(u + (row % 2) / 8, 4, 0.025) ? 182 : 229 + noise * 20;
    } else if (surface === 'metal') {
      const rivet = ((u * 4) % 1 < 0.045 || (u * 4) % 1 > 0.955) && ((v * 2) % 1 < 0.04);
      value = rivet ? 130 : joint(u, 4, 0.016) ? 166 : 233 + noise * 5;
    } else if (surface === 'wood') {
      value = joint(u, 6, 0.028) ? 147 : 226 + Math.sin(u * 170 + Math.sin(v * Math.PI * 4) * 2) * 8 + noise * 9;
    } else if (surface === 'facade') {
      const col = (u * 3) % 1, row = (v * 2) % 1;
      value = col > 0.22 && col < 0.78 && row > 0.3 && row < 0.68 ? 112 : joint(v, 2, 0.025) ? 183 : 239 + noise * 8;
    } else if (surface === 'facade-market') {
      const window = u > 0.18 && u < 0.82 && v > 0.28 && v < 0.83;
      value = window ? Math.abs(u - 0.5) < 0.025 || Math.abs(v - 0.56) < 0.02 ? 192 : 108 : joint(v, 1, 0.045) ? 176 : 237 + noise * 9;
    } else if (surface === 'facade-arcade') {
      const arch = u > 0.18 && u < 0.82 && v > 0.16 && (v < 0.55 || ((u - 0.5) / 0.32) ** 2 + ((v - 0.55) / 0.3) ** 2 < 1);
      value = arch ? 119 : joint(v, 5, 0.055) ? 211 : 239 + noise * 8;
    } else if (surface === 'facade-warehouse') {
      const slit = u > 0.14 && u < 0.86 && v > 0.65 && v < 0.85;
      value = slit ? joint(u, 4, 0.07) ? 185 : 101 : joint(u, 1, 0.055) ? 177 : 237 + noise * 10;
    } else if (surface === 'sign') value = u < 0.06 || u > 0.94 || v < 0.07 || v > 0.93 ? 154 : 242;
    const i = (y * resolution + x) * 4;
    bytes[i] = bytes[i + 1] = bytes[i + 2] = Math.round(value); bytes[i + 3] = 255;
  }
  return bytes;
}

// Existing structural geometry is never moved, resized, replaced or removed.
// Trim solids are contained in their parent wall, so their collision union is
// unchanged. Supports and background masses are checked separately after finish.
export function decorateSpatialStage(stage, { architecture = true } = {}) {
  const areas = [...stage.areas].sort((a, b) => b.id.length - a.id.length);
  const original = stage.objects.filter(o => !o.id.startsWith('sp_finish_'));
  const objects = original.map(o => {
    let area = areas.find(a => o.id === `sp_area_${a.id}` || o.id.startsWith(`sp_area_${a.id}_floor_`) || o.id === `sp_marker_${a.id}` || o.id.startsWith(`sp_wall_${a.id}_`));
    const match = /^sp_link_(\d+)(?:_|$)/.exec(o.id);
    if (match) {
      const c = stage.connections[Number(match[1])];
      const ends = c ? stage.areas.filter(a => a.id === c.from || a.id === c.to) : [];
      area = ends.find(a => a.level > 0) || ends.find(a => a.enclosure === 'walled') || ends[0];
    }
    const district = districtFor(area), p = palette[district];
    const marker = ['spawn', 'goal', 'checkpoint'].includes(o.role);
    const surface = marker ? 'sign' : o.role === 'wall' ? (district === 'high' ? 'metal' : district === 'lane' ? 'brick' : 'stucco') : o.role === 'climb' ? 'concrete' : o.role === 'bridge' ? p.surface : 'concrete';
    const floorLabel = area && o.id === `sp_area_${area.id}` && Object.hasOwn(floorColors, area.kind)
      ? (area.kind === 'entry' ? '入口' : area.kind === 'goal' ? '目的地' : area.name).slice(0, 48) : undefined;
    const color = floorLabel ? floorColors[area.kind] : marker ? p.accent : o.role === 'wall' ? p.wall : p.floor;
    return { ...o, color: ['ground', 'pit'].includes(o.role) ? '#73817d' : color,
      material: 0, spatialAppearance: appearance(surface, district, 'structure', floorLabel || (marker ? area?.name?.slice(0, 48) : undefined)) };
  });
  const trims = [];
  for (const o of objects.filter(o => o.role === 'wall' && (o.id.startsWith('sp_wall_') || o.id.startsWith('sp_link_')))) {
    if (Math.abs(o.rot?.[0] || 0) > 0.001 || Math.abs(o.rot?.[2] || 0) > 0.001 || o.customModelUrl) continue;
    const district = o.spatialAppearance.district, p = palette[district];
    // Crown and foot courses occupy the existing volume, with no protrusions.
    const height = Math.min(0.12, o.size[1] / 4);
    for (const [suffix, y] of [['crown', o.pos[1] + o.size[1] / 2 - height / 2], ['foot', o.pos[1] - o.size[1] / 2 + height / 2]]) {
      trims.push(box(`sp_finish_${o.id}_${suffix}`, `${o.name}の${suffix === 'crown' ? '笠木' : '基壇'}`, [o.pos[0], y, o.pos[2]], [o.size[0], height, o.size[2]], suffix === 'crown' ? p.accent : '#717d79', district === 'high' ? 'metal' : 'concrete', district, 'trim', o.rot?.[1] || 0));
    }
  }
  const extra = [];
  if (architecture) {
    extra.push(...spatialArchitectureModules(stage));
    for (const a of stage.areas.filter(a => a.y >= 4)) {
      const height = a.y - 0.3 + 8.5;
      const inset = spatialCornerInset(a);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const column = box(`sp_finish_platform_${a.id}_${sx}_${sz}`, `${a.name}を支える柱`,
          [a.x + sx * (a.width / 2 - 0.7), -8.5 + height / 2, a.z + sz * (a.depth / 2 - inset - 0.7)],
          [0.5, height, 0.5], '#7e8c87', 'concrete', 'high', 'support');
        column.spatialAppearance.areaId = a.id;
        extra.push(column);
      }
    }
    for (const a of stage.areas.filter(a => a.enclosure === 'walled')) {
      const district = districtFor(a), p = palette[district];
      const add = (suffix, name, pos, size, color, surface, category, yaw = 0, label) => {
        const obj = box(`sp_finish_room_${a.id}_${suffix}`, `${a.name}の${name}`, pos, size, color, surface, district, category, yaw);
        obj.spatialAppearance.areaId = a.id;
        if (label) obj.spatialAppearance.label = label.slice(0, 48);
        extra.push(obj);
      };
      // A real ceiling, above the 1.8m player, rather than a visual-only roof.
      add('roof', '屋根', [a.x, a.y + 2.95, a.z], [a.width + 0.5, 0.3, a.depth + 0.5], '#6d888b', 'metal', 'roof');
      for (const c of stage.connections.filter(c => c.from === a.id || c.to === a.id)) {
        const other = stage.areas.find(b => b.id === (c.from === a.id ? c.to : c.from));
        const axis = other.x === a.x ? 'z' : 'x', direction = Math.sign(other[axis] - a[axis]);
        const yaw = Math.atan2(axis === 'x' ? direction : 0, axis === 'z' ? direction : 0);
        const width = c.width + 0.5;
        const x = a.x + (axis === 'x' ? direction * (a.width / 2 + 0.125) : 0);
        const z = a.z + (axis === 'z' ? direction * (a.depth / 2 + 0.125) : 0);
        const suffix = `${c.object_id}_${c.from === a.id ? 'from' : 'to'}`;
        // Door opening remains at least 2.4m high; jambs fit within the old walls.
        add(`${suffix}_lintel`, '入口のまぐさ', [x, a.y + 2.6, z], [width, 0.4, 0.25], p.accent, 'concrete', 'portal', yaw);
        for (const side of [-1, 1]) add(`${suffix}_jamb_${side}`, '入口枠',
          [x + Math.cos(yaw) * side * (width / 2 + 0.1), a.y + 1.2, z - Math.sin(yaw) * side * (width / 2 + 0.1)], [0.2, 2.4, 0.25], p.accent, 'concrete', 'portal', yaw);
        // Canopy extends outside the doorway at 2.75m clearance.
        add(`${suffix}_canopy`, '入口の庇', [x + Math.sin(yaw) * 0.4, a.y + 2.85, z + Math.cos(yaw) * 0.4], [width + 0.4, 0.2, 1.05], p.accent, 'metal', 'portal', yaw);
        add(`${suffix}_sign`, '案内看板', [x + Math.sin(yaw) * 0.2, a.y + 2.6, z + Math.cos(yaw) * 0.2], [Math.min(width - 0.4, 3.2), 0.3, 0.12], p.wall, 'sign', 'sign', yaw, a.name);
      }
    }
    for (const c of stage.connections.filter(c => !c.rise)) {
      const floor = stage.areas.find(a => a.id === c.from)?.y;
      if (!(floor >= 4)) continue;
      for (const along of [-c.length * 0.3, c.length * 0.3]) for (const side of [-1, 1]) {
        const deck = objects.find(o => o.id === c.object_id);
        const [x, z] = worldXZ(deck, side * (c.width / 2 + 0.125), along);
        const top = floor - 0.3, height = top + 8.5;
        extra.push(box(`sp_finish_bridge_${c.object_id}_${along < 0 ? 'start' : 'end'}_${side}`, '高架を支える橋脚', [x, -8.5 + height / 2, z], [0.25, height, 0.55], '#7e8c87', 'concrete', 'high', 'support', c.yaw));
      }
    }
    const bounds = original.filter(o => !['ground', 'pit'].includes(o.role)).map(getBounds);
    const minX = Math.min(...bounds.map(b => b.minX)), maxX = Math.max(...bounds.map(b => b.maxX)), minZ = Math.min(...bounds.map(b => b.minZ)), maxZ = Math.max(...bounds.map(b => b.maxZ));
    const positions = [
      ...[0.15, 0.5, 0.85].map((t, i) => [minX + (maxX - minX) * t, minZ - 8, 6 + i * 2]),
      ...[0.15, 0.5, 0.85].map((t, i) => [maxX + 8, minZ + (maxZ - minZ) * t, 6 + i]),
      ...[0.2, 0.7].map((t, i) => [minX - 8, minZ + (maxZ - minZ) * t, 7 + i * 2]),
    ];
    positions.forEach(([x, z, height], i) => {
      extra.push(box(`sp_finish_backdrop_${i}`, '経路外の港町の建物', [x, height / 2 - 0.3, z], [7, height, 7], ['#c9b99d', '#afa591', '#b4beb5'][i % 3], 'facade', 'neutral', 'backdrop'));
    });
  }
  return { ...stage, objects: [...objects, ...trims, ...extra], design_rationale: { ...stage.design_rationale,
    tradeoffs: [...stage.design_rationale.tradeoffs.filter(s => !s.startsWith('外観:')), '外観: 明るい港町。石舗装の中庭、青緑の高架、暖色の裏道で場所を識別します。競技バランスは未評価です。'],
    spatial_design: { ...stage.design_rationale.spatial_design, finish: { version: 1, revision: 5, style: SPATIAL_FINISH_STYLE, addedObjects: trims.length + extra.length } },
  } };
}

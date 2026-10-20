import { supportsBuildingColors } from './buildingAppearance.js';

export const TERRACE_DISTRICTS = [
  { id: 'central', label: '中央の広場', areas: ['market', 'landing'], floor: '#cab790', wall: '#dfd0ae', trim: '#8c6b42', roof: '#a6754f' },
  { id: 'west', label: '西の尾根', areas: ['garden', 'ridge', 'north_landing', 'upper'], floor: '#bda58d', wall: '#d2ad96', trim: '#8b5142', roof: '#935d49' },
  { id: 'east', label: '東の住宅通り', areas: ['south_west', 'south_market', 'south_east', 'east_landing'], floor: '#a8bebc', wall: '#c5d4c9', trim: '#387c83', roof: '#5f7f7c' },
];

// Membership follows area identity, so rotating or mirroring a layout never
// swaps the route colours. Inter-district connections retain neutral paving.
const district = (palette, label, areas) => ({ ...TERRACE_DISTRICTS[palette], label, areas });
export const FAMILY_DISTRICTS = {
  market: [district(0, '市場と中庭', ['arrival', 'market', 'court']),
    district(1, '尾根の道', ['ridge']), district(2, '低地の路地', ['lane'])],
  bridge: [district(0, '中央と空中広場', ['entry', 'centre', 'central_landing', 'goal', 'sky_junction', 'sky_court']),
    district(1, '高台と住宅の回遊路', ['high_s', 'high_n', 'west', 'west_return', 'west_landing']),
    district(2, '壁に囲まれた迂回路', ['east_s', 'east_mid', 'east_n'])],
  cloister: [district(0, '中庭と横断回廊', ['arrival', 'court', 'destination', 'sky_gallery']),
    district(1, '西の側廊と上層街区', ['south_west', 'west_lane', 'north_west', 'west_tower', 'west_corner', 'west_upper']),
    district(2, '東の側廊と上層街区', ['south_east', 'east_lane', 'north_east', 'east_tower', 'east_corner', 'east_upper'])],
};

// Topological districts follow area IDs through rotation and mirroring.
// Colour is the only object property changed. A completed finish is retained
// on reapplication so subsequent manual colour edits remain authoritative.
export function finishTerrainDistrictColors(stage) {
  const design = stage.design_rationale.spatial_design;
  const variation = design.variation;
  const districts = variation?.family === 'terraces' && variation.version >= 14 ? TERRACE_DISTRICTS :
    variation?.version >= 21 ? FAMILY_DISTRICTS[variation.family] : null;
  if (!districts || design.terrain_wayfinding?.version === 1) return stage;
  const districtFor = id => districts.find(d => d.areas.includes(id));
  const areas = [...stage.areas].sort((a, b) => b.id.length - a.id.length);
  const counts = new Map(districts.map(d => [d.id, 0]));
  const objects = stage.objects.map(o => {
    if (o.id === 'sp_terrain_surround' || o.customModelUrl || o.modelGrounding || o.spatialAppearance?.category === 'support') return o;
    let district;
    const link = /(?:^|_)sp_link_(\d+)(?:_|$)/.exec(o.id);
    if (link) {
      const c = stage.plan.connections[Number(link[1])];
      const from = districtFor(c?.from), to = districtFor(c?.to);
      if (!from || from !== to) return o;
      district = from;
    } else {
      const area = o.buildingPlacement?.from || o.spatialAppearance?.areaId || areas.find(a => o.id === `sp_area_${a.id}` || o.id.startsWith(`sp_area_${a.id}_`))?.id;
      district = districtFor(area);
    }
    if (!district) return o;
    let result = o;
    if (o.buildingPlacement && supportsBuildingColors(o)) result = { ...o, color: district.wall, color2: district.roof, color3: district.trim };
    else if (o.role === 'landform' && o.terrainProfile) result = { ...o, color: district.floor };
    else if (o.role === 'wall' && o.spatialAppearance?.category === 'structure') result = { ...o, color: o.spatialAppearance.railing ? district.trim : district.wall };
    else if (o.role === 'wall' && o.spatialAppearance?.moduleId === 'street_gateway') result = { ...o, color: o.id.endsWith('_header') ? district.trim : district.wall };
    if (result !== o) counts.set(district.id, counts.get(district.id) + 1);
    return result;
  });
  const rationale = structuredClone(stage.design_rationale);
  rationale.spatial_design.terrain_wayfinding = { version: 1, districts: districts.map(d => ({ ...d, paintedObjects: counts.get(d.id) })),
    scope: 'エリアの接続に沿う3街区の配色。高さ・形状・当たり判定・材質名は維持。街区をまたぐ道は既存色を保持。' };
  return { ...stage, objects, design_rationale: rationale };
}

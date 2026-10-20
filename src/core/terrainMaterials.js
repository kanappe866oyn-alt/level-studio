export const TERRAIN_DISTRICTS = {
  entry: { floor: '#c5c8b6', wall: '#d8cfb5', crown: '#34797b', foot: '#6b7771' },
  court: { floor: '#d4bd94', wall: '#dfd1b3', crown: '#8c6b48', foot: '#827665' },
  high: { floor: '#b5c1bc', wall: '#9bb5ad', crown: '#376d72', foot: '#647a76' },
  lane: { floor: '#c2a18a', wall: '#c29b7e', crown: '#795746', foot: '#7a695e' },
  neutral: { floor: '#c0b59b', wall: '#b7a384', crown: '#8a7c64', foot: '#787166' },
};
const districtFor = area => area?.level > 0 ? 'high' : area?.enclosure === 'walled' ? 'lane' : area?.kind === 'courtyard' ? 'court' : area?.kind === 'entry' ? 'entry' : 'neutral';

// Floor purpose should remain legible when several areas share one elevation.
// Boundary colours still follow the district; only the existing top is painted.
export function terrainPavingForArea(area) {
  if (area?.enclosure === 'walled') return { material: 'brick-paving', color: TERRAIN_DISTRICTS.lane.floor };
  if (area?.kind === 'entry') return { material: 'paving', color: TERRAIN_DISTRICTS.entry.floor };
  if (area?.kind === 'goal') return { material: 'slate', color: '#9baeb6' };
  if (area?.kind === 'courtyard') {
    const elongated = Math.max(area.width, area.depth) / Math.min(area.width, area.depth) >= 2;
    return elongated ? { material: 'brick-paving', color: '#c6a383' } : { material: 'setts', color: TERRAIN_DISTRICTS.court.floor };
  }
  if (area?.kind === 'high' || area?.level > 0) return { material: 'slate', color: TERRAIN_DISTRICTS.high.floor };
  return { material: 'paving', color: TERRAIN_DISTRICTS.neutral.floor };
}

// Appearance is applied to existing surfaces only; it never adds a walking layer.
export function applyTerrainMaterials(objects, areas = [], connections = [], openRailings = false) {
  const sortedAreas = [...areas].sort((a, b) => b.id.length - a.id.length);
  const buildings = objects.filter(o => o.buildingPlacement).map(o => ({ root: `sp_build_${o.buildingPlacement.plotId}_`, from: o.buildingPlacement.from }));
  return objects.map(o => {
    let area = sortedAreas.find(a => o.id === `sp_area_${a.id}` || o.id === `sp_area_${a.id}_floor_north` || o.id === `sp_area_${a.id}_floor_south` || o.id.startsWith(`sp_wall_${a.id}_`) || o.spatialAppearance?.category === 'support' && o.spatialAppearance.areaId === a.id);
    const building = buildings.find(b => o.id.startsWith(b.root));
    if (building) area = areas.find(a => a.id === building.from);
    const link = connections.find(c => o.id === c.object_id || o.id.startsWith(`${c.object_id}_`));
    if (link) {
      const ends = [link.from, link.to].map(id => areas.find(a => a.id === id)).filter(Boolean);
      area = ends.find(a => a.level > 0) || ends.find(a => a.enclosure === 'walled') || ends[0];
    }
    const district = districtFor(area), palette = TERRAIN_DISTRICTS[district];
    const finish = surface => ({ version: 1, style: 'harbor', surface, district, category: 'structure', ...(area ? { areaId: area.id } : {}) });
    if (o.role === 'landform' && o.terrainProfile) {
      const landscape = o.id === 'sp_terrain_surround';
      const paving = link ? { material: 'paving', color: '#b9bdb5' } : building ? { material: 'paving', color: palette.floor } : terrainPavingForArea(area);
      return { ...o, color: landscape ? '#668363' : paving.color, color2: landscape ? '#876d52' : '#8b918b',
        terrainProfile: { ...o.terrainProfile, surfaceMaterial: landscape ? 'grass' : paving.material, sideMaterial: landscape ? 'rock' : 'masonry', ...(!landscape ? { surfaceMapping: 'world' } : {}) } };
    }
    if (o.role === 'wall') {
      if (o.spatialAppearance?.category === 'portal' && o.spatialAppearance.moduleId === 'street_gateway') return o;
      if (o.spatialAppearance?.category === 'support') return { ...o, color: palette.foot, spatialAppearance: { ...finish('concrete'), category: 'support', ...(o.spatialAppearance.moduleId ? { moduleId: o.spatialAppearance.moduleId } : {}) } };
      const eligible = area?.level > 0 && o.size[1] >= 0.7 && o.size[1] <= 0.81 &&
        (link ? !link.rise && link.enclosure === 'open' : o.id.startsWith('sp_wall_') && area.enclosure === 'open');
      if (o.spatialAppearance?.railing || openRailings && eligible) return { ...o, color: palette.crown, spatialAppearance: { ...finish('metal'), railing: true, ...(o.spatialAppearance?.railingAxis ? { railingAxis: o.spatialAppearance.railingAxis } : {}) } };
      return { ...o, color: palette.wall, spatialAppearance: { ...finish(o.size[1] > 1 ? 'stucco' : 'brick'), edgeTrim: true,
        ...(o.spatialAppearance?.moduleId === 'stone_boundary' ? { moduleId: 'stone_boundary' } : {}) } };
    }
    if (o.role === 'climb') return { ...o, color: palette.floor, spatialAppearance: finish('concrete') };
    if (o.role === 'bridge') return { ...o, color: palette.floor, spatialAppearance: finish(district === 'high' ? 'wood' : 'paving') };
    return o;
  });
}

// Asset bytes stay in project files; AI only needs the layout and appearance choices.
export function serializeSceneForAI(objects, { compactTerrain = false } = {}) {
  return JSON.stringify(objects.map(({ id, name, type, role, pos, size, rot, points, color, color2, color3, variant, material, terrainProfile, riverProfile, modelGrounding, buildingPlacement }) => ({
    id, name, type, role, pos, size, rot, points, color, color2, color3, variant, material, terrainProfile: compactTerrain && terrainProfile?.surfaceGrid ? { ...terrainProfile, surfaceGrid: { columns: terrainProfile.surfaceGrid.columns, rows: terrainProfile.surfaceGrid.rows, minRatio: Math.min(...terrainProfile.surfaceGrid.heights), maxRatio: Math.max(...terrainProfile.surfaceGrid.heights), heightsOmitted: true } } : terrainProfile, riverProfile, modelGrounding, buildingPlacement,
  })));
}

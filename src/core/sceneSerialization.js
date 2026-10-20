// Asset bytes stay in project files; AI only needs the layout and appearance choices.
export function serializeSceneForAI(objects) {
  return JSON.stringify(objects.map(({ id, name, type, role, pos, size, rot, points, color, color2, color3, variant, material, terrainProfile, riverProfile, modelGrounding, buildingPlacement }) => ({
    id, name, type, role, pos, size, rot, points, color, color2, color3, variant, material, terrainProfile, riverProfile, modelGrounding, buildingPlacement,
  })));
}

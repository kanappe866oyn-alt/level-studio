// Slots correspond to the authored materials in public/building/{1,2,3}.glb.
// Glass, recessed openings and safety markings retain their authored colours.
export const BUILDING_MATERIAL_SLOTS = {
  'Warm plaster | house': 0,
  'Slate blue | wall': 0,
  'Muted terracotta | roof': 1,
  'Pale concrete | trim': 2,
  'Desaturated teal | base': 2,
};

export const supportsBuildingColors = object => object?.role === 'building' && !object.customModelUrl && [1, 2, 3].includes(object.variant || 1);

// Flat-roof kits share trim materials with their walls. Tint the cloned roof
// mesh, rather than its shared material name, so the roof colour stays distinct.
export function finishBuildingRoofMaterial(material, meshName, object, roofColor) {
  if (!supportsBuildingColors(object) || !roofColor) return false;
  const name = meshName.replaceAll('_', ' ').replace(/\.\d+$/, '').trim();
  const roofs = { 1: ['Roof slab', 'Roof parapet'], 2: ['Pitched roof', 'Roof ridge'], 3: ['Base roof', 'Control room roof'] };
  if (!roofs[object.variant || 1].includes(name)) return false;
  material.color.set(roofColor);
  return true;
}

export function finishBuildingMaterial(material, colors) {
  const slot = BUILDING_MATERIAL_SLOTS[material.name];
  if (slot === undefined) return false;
  if (colors[slot]) material.color.set(colors[slot]);
  material.emissive?.set('#000000');
  material.emissiveIntensity = 0;
  material.roughness = 0.9;
  material.metalness = 0;
  return true;
}

const palettes = [
  ['#d8c7a7', '#a56c52', '#497b78'],
  ['#b8c5bb', '#97684e', '#3b6a6d'],
  ['#cfb29c', '#8a5b4b', '#486e70'],
  ['#c5ceca', '#9e7355', '#496c70'],
];

// Colour only: original object order, geometry, model and collision data persist.
// Existing user colours win when finishing an edited scene again.
export function finishTerrainBuildingColors(stage) {
  const objects = stage.objects.map(object => {
    if (!object.buildingPlacement || !supportsBuildingColors(object)) return object;
    let hash = 0;
    for (const char of object.id) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
    const [wall, roof, trim] = palettes[hash % palettes.length];
    return { ...object, color: object.color ?? wall, color2: object.color2 ?? roof, color3: object.color3 ?? trim };
  });
  return { ...stage, objects };
}

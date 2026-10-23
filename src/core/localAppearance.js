export const LOCAL_PALETTES = [
  { id: 'sand', label: '砂岩の街', floor: '#b9a88b', wall: '#d6c5a8', rock: '#8d8170', accent: '#718b89' },
  { id: 'slate', label: '青灰色の街', floor: '#77848c', wall: '#b3c0c7', rock: '#65737e', accent: '#ad9576' },
  { id: 'earth', label: '落ち着いた土色', floor: '#998e73', wall: '#c2b79a', rock: '#817c69', accent: '#778569' },
];
const groups = {
  ground: 'floor', corridor: 'floor', platform: 'floor', climb: 'floor', bridge: 'floor',
  wall: 'wall', building: 'wall', rock: 'rock', landform: 'rock', cover: 'accent',
};

// Change only tint fields: IDs, dimensions, geometry, assets and collision roles
// remain identical, so paths and silhouettes cannot change with a palette.
export function applyLocalPalette(objects, paletteId, rationale) {
  const palette = LOCAL_PALETTES.find(p => p.id === paletteId);
  if (!palette) throw new Error('配色が見つかりません。');
  const protectedRoles = new Set((rationale?.generation_contract?.requirements || [])
    .filter(r => r.kind === 'color').map(r => r.role));
  let changed = 0, protectedCount = 0;
  const next = objects.map(object => {
    const group = groups[object.role];
    if (!group || object.customModelUrl) return object;
    if (protectedRoles.has(object.role)) { protectedCount++; return object; }
    const color = palette[group];
    if (object.color === color) return object;
    changed++;
    return { ...object, color };
  });
  return { objects: next, changed, protectedCount, label: palette.label };
}

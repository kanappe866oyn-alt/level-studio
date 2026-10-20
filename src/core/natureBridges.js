const box = (id, name, role, pos, size, color) => ({ id, name, role, type: 'box', pos, size, rot: [0, 0, 0], color, variant: 1, material: 0 });

export function buildNatureBridge(patch, channel, mode) {
  const id = `nature_bridge_${patch.level}`, width = channel + 0.4;
  const objects = [box(id, '両岸をつなぐ木の橋', 'bridge', [0, patch.y - 0.1, patch.z], [width, 0.2, 4], '#a68a62')];
  if (mode === 'free') for (const side of [-1, 1]) {
    objects.push({ ...box(`${id}_rail_${side}`, '橋の木製欄干', 'barrier', [0, patch.y + 0.55, patch.z + side * 1.84], [width - 0.2, 1.1, 0.22], '#a68a62'), variant: 2 });
  }
  return objects;
}

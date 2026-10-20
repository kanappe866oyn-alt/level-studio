import { getModelDefault } from './modelCatalog.js';
import { natureTint } from './natureDressing.js';

export const NATURE_BACKDROP_DEPTH = 18;

// The rear foundation and shipped cliff meshes are ordinary saved/exported objects.
// Keep the full rotated cliff footprints behind the original terrace/river area.
export function buildNatureBackdrop(plan) {
  if (!plan.backdropEnabled) return [];
  const z = -plan.depth / 2 - NATURE_BACKDROP_DEPTH / 2;
  const objects = [{ id: 'nature_backdrop_ground', name: '奥の岩壁を支える土台', role: 'landform', type: 'box',
    pos: [0, -2.5, z], size: [plan.width, 1, NATURE_BACKDROP_DEPTH], rot: [0, 0, 0],
    color: plan.rockColor, variant: 1, material: 0 }];
  const ref = getModelDefault('cliff', 1);
  for (let i = 0; i < 3; i++) {
    const size = [plan.width * 0.28, [10, 15, 12][i] + plan.rise * 2, NATURE_BACKDROP_DEPTH * 0.75];
    objects.push({ id: `nature_backdrop_cliff_${i}`, name: ['奥の西側の岩壁', '奥の中央の岩壁', '奥の東側の岩壁'][i],
      role: 'cliff', type: 'box', pos: [(i - 1) * plan.width * 0.32, -2 + size[1] / 2, z],
      size, rot: [0, [0.04, Math.PI, -0.04][i], 0], color: natureTint(plan.rockColor, [0.08, 0.12, 0.04][i]), variant: 1, material: 0,
      modelDimensions: { path: ref.path, size: [...ref.bounds.size], defaultScale: ref.scale } });
  }
  return objects;
}

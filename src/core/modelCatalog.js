import ASSETS from '../assets.json' with { type: 'json' };
import DIMENSIONS from '../data/model_dimensions.json' with { type: 'json' };
import CALIBRATION from '../data/model_calibration.json' with { type: 'json' };

export function usesNativeSizing(role, variant = 1) {
  const prefab = ASSETS.SEMANTIC_PREFABS[role];
  if (!prefab?.hasModel) return false;
  if (prefab.nativeSizing !== undefined) return prefab.nativeSizing;
  // Surfaces and repeated parts keep their requested dimensions.
  return !['terrain', 'platform', 'slope', 'climb'].includes(role) && !(role === 'barrier' && variant === 2);
}

export function getModelDefault(role, variant = 1) {
  const path = `/${role}/${variant}.glb`;
  const bounds = DIMENSIONS[path];
  if (!bounds) return null;
  const adjustment = CALIBRATION[`${role}/${variant}`];
  const scale = (ASSETS.SEMANTIC_PREFABS[role]?.modelScale ?? 1) * (adjustment?.factor ?? 1);
  return { path, bounds, scale, note: adjustment?.note, size: bounds.size.map(value => value * scale) };
}

export function createSizePreviewObject(role, variant = 1) {
  const model = getModelDefault(role, variant);
  if (!model) throw new Error(`Missing model: ${role}/${variant}`);
  // Use a useful assembled example for the procedural stairs and ladder.
  const size = role === 'climb'
    ? (variant === 1 ? [2, 2, 4] : [model.size[0], 4 * model.scale, model.size[2]])
    : [...model.size];
  return {
    id: 'size-preview', name: `${role} ${variant}`, role, variant,
    type: 'box', material: 0, color: null, rot: [0, 0, 0],
    size, pos: [0, size[1] / 2, 0],
    modelDimensions: { path: model.path, size: [...model.bounds.size], defaultScale: model.scale },
  };
}

export const MODEL_PREVIEW_ENTRIES = Object.keys(ASSETS.SEMANTIC_PREFABS).flatMap(role => {
  const prefab = ASSETS.SEMANTIC_PREFABS[role];
  return Array.from({ length: prefab.hasModel ? prefab.variants || 1 : 0 }, (_, index) => {
    const variant = index + 1;
    return getModelDefault(role, variant) ? { role, variant, key: `${role}/${variant}` } : null;
  }).filter(Boolean);
});

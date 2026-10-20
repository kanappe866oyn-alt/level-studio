export const TERRAIN_MODEL_ROLES = ['rock', 'cliff', 'tree', 'plant'];

// Explicit embedding keeps fitted landscape models attached to the chosen terrain through
// normalization, edits and recovery, instead of snapping their base back to Y=0.
export function validateModelGrounding(value, object) {
  // Large outcrops need a deeper, size-bounded embed on sloping ground.
  const maxInset = ['rock', 'cliff'].includes(object.role) ? Math.max(1, Math.min(4, (object.size?.[1] || 0) * 0.72)) : 1;
  if (!value || typeof value !== 'object' || Array.isArray(value) || !TERRAIN_MODEL_ROLES.includes(object.role) ||
      typeof value.surfaceId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.surfaceId) ||
      !Number.isFinite(value.inset) || value.inset < 0 || value.inset > maxInset) throw new Error('モデルの地形への接地設定が不正です。');
  return { surfaceId: value.surfaceId, inset: value.inset };
}

// One scene unit is one metre. Use the same reference in editor and play mode.
export const CHARACTER_HEIGHT = 1.8;
export const PLAYER_EYE_HEIGHT = 1.65;

export function getCharacterTransform(bounds) {
  const scale = CHARACTER_HEIGHT / bounds.size[1];
  return {
    scale,
    position: [-bounds.center[0] * scale, -bounds.minY * scale, -bounds.center[2] * scale],
  };
}

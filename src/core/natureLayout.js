export const NATURE_LAYOUTS = ['balanced', 'lower-wide', 'middle-wide', 'upper-wide'];

// Keep at least 12m for each plaza, stair approach and detour. Only the spare area varies.
export function natureTerraceLayout(depth, stairRun, layout) {
  const available = depth - 4 - 2 * stairRun;
  const weights = { balanced: [1 / 3, 1 / 3, 1 / 3], 'lower-wide': [0.55, 0.27, 0.18],
    'middle-wide': [0.22, 0.56, 0.22], 'upper-wide': [0.18, 0.27, 0.55] }[layout];
  const spare = Math.max(0, available - 36);
  const depths = weights.map(weight => available >= 36 ? 12 + spare * weight : available / 3);
  const patches = [];
  let edge = -depth / 2 + 2;
  for (let level = 2; level >= 0; level--) {
    patches[level] = { depth: depths[level], z: edge + depths[level] / 2 };
    edge += depths[level] + stairRun;
  }
  return patches;
}

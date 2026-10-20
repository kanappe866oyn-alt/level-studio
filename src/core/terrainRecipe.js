export const TERRAIN_VERSION = 35;
export const TERRAIN_FAMILIES = [
  { id: 'market', title: '市場と路地', description: '広い中庭と市場を、低地の路地と尾根の道で結びます。' },
  { id: 'terraces', title: '段丘の集落', description: '階段と坂を通り、低地から2・4・6mの広場へ登ります。' },
  { id: 'bridge', title: '高架と回遊路', description: '高架の上下、住宅街の回遊路、踊り場のある階段を組み合わせます。' },
  { id: 'cloister', title: '中庭と上層回廊', description: '中庭を囲む0・2・4mの道と、その上を渡る6mの回廊を作ります。' },
];

export function terrainFamily(seed, version = TERRAIN_VERSION) {
  return version >= 9 && seed % 12 === 8 ? 'cloister' : ['market', 'terraces', 'bridge'][seed % 3];
}

export function validateTerrainRecipe({ seed, version = TERRAIN_VERSION }) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('生成番号は0〜4294967295の整数で指定してください。');
  if (!Number.isInteger(version) || version < 1 || version > TERRAIN_VERSION) throw new Error('未対応の地形生成ルールです。');
  return { seed, version };
}

// Find the next seed of the requested family, including unsigned wraparound.
// This selects a recipe; geometry is still assembled and checked in the worker.
export function seedForTerrainFamily(seed, family) {
  validateTerrainRecipe({ seed });
  if (!TERRAIN_FAMILIES.some(item => item.id === family)) throw new Error('構成を選んでください。');
  while (terrainFamily(seed) !== family) seed = (seed + 1) >>> 0;
  return seed;
}

// Deliberately different proportions and topology from the bridge-town sample.
// Dimensions describe the playable foundation; native buildings are added later.
export function createMarketTerrainPlan() {
  const area = (id, name, kind, x, z, y, width, depth) => ({
    id, name, kind, gx: x / 16, gz: z / 16, level: y / 4, width, depth, enclosure: 'open',
  });
  const link = (from, to, traversal, curve = 0) => ({ from, to, width: 4, flare: 0.5, enclosure: 'open',
    ...(traversal ? { traversal } : {}), ...(curve ? { curve } : {}) });
  return {
    intent: '広い中庭と細長い市場通りを、0・2・4mの地形でつなぐ。市場側と西の長い路地の二経路を持ち、中庭の階段から経路を乗り換えられる。',
    foundation: 'terrain', openRailings: true,
    areas: [area('arrival', '南西の入口', 'entry', -24, 32, 0, 12, 10),
      area('market', '横長の市場通り', 'courtyard', 12, 32, 2, 24, 8),
      area('court', '大きな中段広場', 'courtyard', 12, 0, 2, 24, 18),
      area('destination', '北の展望広場', 'goal', 12, -32, 4, 16, 12),
      area('lane', '低地の長い路地', 'passage', -24, 0, 0, 8, 24),
      area('ridge', '西の高台', 'high', -24, -32, 4, 12, 10)],
    connections: [link('arrival', 'market', 'ramp', 2), link('market', 'court', undefined, -3),
      link('court', 'destination', 'ramp', 2), link('arrival', 'lane', undefined, -2),
      link('lane', 'ridge', 'ramp', 1), link('ridge', 'destination', undefined, -3),
      link('lane', 'court', 'stairs', 2.5)],
    buildings: [{ id: 'market_houses', from: 'market', side: 'south', variant: 2, variants: [2, 1], approachLength: 2 },
      { id: 'court_house', from: 'court', side: 'east', variant: 3, approachLength: 2 },
      { id: 'ridge_house', from: 'ridge', side: 'west', variant: 2, approachLength: 2 }],
    requirements: { minimumRoutes: 2, sightlines: [] },
    limitations: ['建物内部の通行は未対応。固定の設計例であり、新規AI生成の指示追従率と対戦バランスは未評価。'],
  };
}

// A second street at 2m and a return street at 4m make the hillside a network,
// rather than two long ascents. Compose before rotation so all links stay axial.
export function withTerraceCrossings(plan) {
  if (!['arrival', 'market', 'landing', 'destination', 'garden', 'ridge', 'upper'].every(id => plan.areas.some(a => a.id === id))) return plan;
  const area = (id, name, kind, x, z, y, width = 10, depth = 10) => ({ id, name, kind, gx: x / 16, gz: z / 16, level: y / 4, width, depth, enclosure: 'open' });
  const link = (from, to, traversal) => ({ from, to, width: 4, enclosure: 'open', flare: 0.25, ...(traversal ? { traversal } : {}) });
  return { ...plan,
    intent: '0mの入口から2mの住宅通りを横断し、4mの踊り場と6mの展望広場へ登る段丘の集落。中央の階段、西の尾根、東の回り込みを入口と目的地の独立した3経路にし、4mの戻り道で経路同士をつなぐ。',
    areas: [...plan.areas,
      area('south_west', '中段の通りの西口', 'passage', -24, 48, 2),
      area('south_market', '中段の横断広場', 'courtyard', 0, 48, 2, 16, 12),
      area('south_east', '中段の通りの東口', 'passage', 24, 48, 2),
      area('east_landing', '東の住宅テラス', 'high', 24, 24, 4),
      area('north_landing', '上段の回遊広場', 'high', 0, -24, 4, 14, 10)],
    connections: [...plan.connections.filter(c => !(c.from === 'ridge' && c.to === 'upper')),
      link('ridge', 'north_landing'), link('north_landing', 'upper', 'ramp'), link('landing', 'north_landing'),
      link('arrival', 'south_west', 'ramp'), link('south_west', 'south_market'), link('south_market', 'south_east'),
      link('south_east', 'east_landing', 'stairs'), link('east_landing', 'destination', 'stairs'),
      link('south_market', 'market'), link('market', 'east_landing', 'stairs')],
    buildings: [...plan.buildings.map(p => p.id === 'arrival_house' ? { ...p, side: 'west' } : p.id === 'market_house' ? { ...p, from: 'east_landing' } : p),
      { id: 'north_house', from: 'north_landing', side: 'north', variant: 2, approachLength: 2 }],
    requirements: { ...plan.requirements, minimumRoutes: 3 },
  };
}

// A courtyard district rather than another variation of the long settlement.
// The outer stair towers feed a six-metre gallery above the lower streets.
export function createCloisterTerrainPlan() {
  const area = (id, name, kind, x, z, y, width = 8, depth = 8, enclosure = 'open') => ({ id, name, kind,
    gx: x / 16, gz: z / 16, level: y / 4, width, depth, enclosure });
  const link = (from, to, stairs = false) => ({ from, to, width: 4, flare: 0.25, enclosure: 'open', ...(stairs ? { traversal: 'stairs' } : {}) });
  return {
    intent: '低い20mの中庭を、2mの側廊と4mの北の広場へつながる回遊路で囲む。外側の階段塔を登り、6mの横断回廊から左右の街区を行き来できる。中庭・側廊・上の回廊の上下の通行を分ける。',
    foundation: 'terrain', openRailings: true, pathScreens: true,
    areas: [area('arrival', '南の入口広場', 'entry', 0, 22, 0, 24, 8),
      area('court', '街区に囲まれた中庭', 'courtyard', 0, 0, 0, 20, 20),
      area('destination', '北の目的広場', 'goal', 0, -22, 4, 24, 8),
      area('west_lane', '西の壁に囲まれた側廊', 'room', -22, 0, 2, 8, 24, 'walled'),
      area('east_lane', '東の壁に囲まれた側廊', 'room', 22, 0, 2, 8, 24, 'walled'),
      area('south_west', '南西の中段広場', 'passage', -22, 22, 2),
      area('south_east', '南東の中段広場', 'passage', 22, 22, 2),
      area('north_west', '北西の見晴らし台', 'high', -22, -22, 4),
      area('north_east', '北東の見晴らし台', 'high', 22, -22, 4),
      area('west_tower', '西の上層階段塔', 'passage', -38, -22, 6),
      area('west_corner', '西の上層回廊の角', 'passage', -38, 0, 6),
      area('west_upper', '西の側廊の上の分岐', 'passage', -22, 0, 6, 12, 8),
      area('sky_gallery', '中庭を横断する空中広場', 'passage', 0, 0, 6, 24, 8),
      area('east_upper', '東の側廊の上の分岐', 'passage', 22, 0, 6, 12, 8),
      area('east_corner', '東の上層回廊の角', 'passage', 38, 0, 6),
      area('east_tower', '東の上層階段塔', 'passage', 38, -22, 6)],
    connections: [link('arrival', 'south_west', true), link('south_west', 'west_lane'), link('west_lane', 'north_west', true), link('north_west', 'destination'),
      link('arrival', 'south_east', true), link('south_east', 'east_lane'), link('east_lane', 'north_east', true), link('north_east', 'destination'),
      link('arrival', 'court'), link('court', 'destination', true), link('court', 'west_lane', true), link('court', 'east_lane', true),
      link('north_west', 'west_tower', true), link('west_tower', 'west_corner'), link('west_corner', 'west_upper'),
      link('west_upper', 'sky_gallery'), link('sky_gallery', 'east_upper'), link('east_upper', 'east_corner'), link('east_corner', 'east_tower'), link('east_tower', 'north_east', true)],
    buildings: [{ id: 'south_houses', from: 'arrival', side: 'south', variant: 2, variants: [2, 1], approachLength: 2 },
      { id: 'north_houses', from: 'destination', side: 'north', variant: 1, variants: [1, 2], approachLength: 2 },
      { id: 'north_west_house', from: 'north_west', side: 'north', variant: 2, approachLength: 2 },
      { id: 'north_east_house', from: 'north_east', side: 'north', variant: 2, approachLength: 2 },
      { id: 'south_west_house', from: 'south_west', side: 'south', variant: 2, approachLength: 2 },
      { id: 'south_east_house', from: 'south_east', side: 'south', variant: 2, approachLength: 2 }],
    requirements: { minimumRoutes: 3, sightlines: [{ from: 'north_west', to: 'court', relation: 'visible' }] },
    limitations: ['建物内部の通行、競技バランス、自由な敷地への適応は未評価。'],
  };
}

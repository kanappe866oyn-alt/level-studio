// Expand a bridge neighbourhood with a second crossing above the lower route.
// The narrow north/south dimension keeps the original ascending centre stair
// outside the upper court, preserving headroom throughout that stair.
export function withSkyCourtyard(plan) {
  const under = plan.areas.find(a => a.id === 'under'), centre = plan.areas.find(a => a.id === 'centre');
  const area = (id, name, from, width, depth) => ({ id, name, kind: 'high', gx: from.gx, gz: from.gz, level: 1, width, depth, enclosure: 'open' });
  const link = (from, to, traversal) => ({ from, to, width: 4, enclosure: 'open', ...(traversal ? { traversal } : {}) });
  return { ...plan,
    intent: `${plan.intent} 中庭と高架下の路地の上に4mの空中広場と分岐を設け、西の高架から東の中段へ渡れる上層の回遊路を持つ。`,
    areas: [...plan.areas, area('sky_junction', '高架の分岐広場', under, 14, 14), { ...area('sky_court', '中庭の上の空中広場', centre, 20, 8), enclosure: 'walled' }],
    connections: [...plan.connections.filter(c => !([c.from, c.to].includes('high_s') && [c.from, c.to].includes('high_n'))),
      link('high_s', 'sky_junction'), link('sky_junction', 'high_n'), link('sky_junction', 'sky_court'), link('sky_court', 'east_mid', 'stairs')],
  };
}

// Keep the three arrival-to-goal routes and the upper loop intact. Only the
// optional cross-links vary; no floor is removed to disguise a blocked route.
export function withCloisterConnections(plan, seed) {
  const mode = Math.floor(seed / 12) % 4;
  const lanes = [['west_lane', 'east_lane'], ['west_lane'], ['east_lane'], []][mode];
  const descriptions = ['左右の側廊へ中庭から連絡できる', '西の側廊だけへ中庭から連絡できる',
    '東の側廊だけへ中庭から連絡できる', '側廊への出入りを南北の街路に集める'];
  return { ...plan,
    connections: plan.connections.filter(c => !(c.from === 'court' && ['west_lane', 'east_lane'].includes(c.to)) || lanes.includes(c.to)),
    intent: plan.intent + ` 中庭の連絡階段は${descriptions[mode]}構成。中央・西・東の3経路と上層の回遊を保ち、側廊への回り込み方を変える。`,
  };
}

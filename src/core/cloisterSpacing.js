// Move whole street stacks together before rotation. Lower lanes, upper forks
// and both stair landings stay aligned; the compiler rebuilds the spans.
export function withCloisterSpacing(plan, seed) {
  const profiles = [[22,26],[26,22],[24,26],[26,24],[22,24],[24,22],[24,24],[26,26]];
  const [west,east] = profiles[Math.floor(seed/12)%profiles.length];
  const westIds = new Set(['west_lane','south_west','north_west','west_upper']);
  const eastIds = new Set(['east_lane','south_east','north_east','east_upper']);
  const wide = new Set([...(west>=24?['south_west','west_lane']:[]),...(east>=24?['south_east','east_lane']:[])]);
  return { ...plan, areas: plan.areas.map(a => ({ ...a,
    gx: westIds.has(a.id) ? -west/16 : eastIds.has(a.id) ? east/16 :
      ['west_tower','west_corner'].includes(a.id) ? -(west+16)/16 :
        ['east_tower','east_corner'].includes(a.id) ? (east+16)/16 : a.gx,
  })), connections: plan.connections.map(c => (c.from==='arrival'||c.from==='court') && wide.has(c.to) ? {...c,traversal:'ramp'} : c),
    intent: plan.intent + ` 中庭の中心から西の側廊まで${west}m、東の側廊まで${east}m。上下の側廊と階段塔を一緒に配置し、街区間の幅と回り込みの距離を変える。24m以上離す側の入口・中庭の連絡は、2m上るために必要な長さを確保した坂へ変える。` };
}

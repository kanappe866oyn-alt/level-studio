// A guarded central landing overlooks the court while the western ridge
// watches the garden. An optional direct garden stair keeps its open portal.
export function withTerraceSightPlan(plan) {
  const directGardenStair = plan.connections.some(c => [c.from, c.to].includes('garden') && [c.from, c.to].includes('landing'));
  return { ...plan,
    areas: plan.areas.map(a => a.id === 'landing' ? { ...a, enclosure: 'walled' } : a),
    requirements: { ...plan.requirements, sightlines: [
      { from: 'landing', to: 'market', relation: 'visible' },
      { from: 'ridge', to: 'garden', relation: 'visible' },
      { from: 'garden', to: 'south_east', relation: 'hidden' },
      ...(!directGardenStair ? [{ from: 'landing', to: 'garden', relation: 'hidden' }] : []),
    ] },
    intent: `${plan.intent} 中央の4mの踊り場を囲み、住宅広場が見える。西の尾根からは庭を見渡し、庭から東の迂回路は隠れる。庭への直接階段がある場合は開口部を残し、ない場合は中央の踊り場から庭を隠す。これらの見通しを生成後にも検査する。`,
  };
}


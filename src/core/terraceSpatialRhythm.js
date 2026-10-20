// Compose before rotation: the long dimension follows the authored east-west
// street. Floor boundaries, stair runs and building branches are then rebuilt
// from these extents by the normal generator, rather than scaled afterwards.
export function withTerraceSpatialRhythm(plan) {
  const sizes = {
    market: [16, 14], garden: [16, 14], destination: [14, 12],
    landing: [8, 8], south_west: [8, 8], south_east: [8, 8],
  };
  return { ...plan,
    areas: plan.areas.map(a => sizes[a.id] ? { ...a, width: sizes[a.id][0], depth: sizes[a.id][1] } : a),
    intent: `${plan.intent} 住宅広場と低地の庭は16×14m、展望広場は14×12mに広げ、踊り場は8×8m、横断通りの両端は8×8mに絞る。通りから広場へ出る空間の変化を地面そのものに作る。`,
  };
}


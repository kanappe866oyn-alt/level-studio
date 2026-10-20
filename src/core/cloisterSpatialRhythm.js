// Compose before rotation and building selection. Rebuild actual floors, stairs,
// boundaries and forecourts from these extents instead of stretching a scene.
export function withCloisterSpatialRhythm(plan) {
  const sizes = { court: [24, 22], arrival: [24, 10], destination: [24, 10],
    west_lane: [10, 24], east_lane: [10, 24], west_upper: [14, 8], east_upper: [14, 8], sky_gallery: [20, 8] };
  return { ...plan, sharedSupportJoints: true, areas: plan.areas.map(a => sizes[a.id] ? { ...a, width: sizes[a.id][0], depth: sizes[a.id][1] } : a),
    intent: plan.intent.replace('低い20mの中庭', '低い24×22mの中庭') + ' 中央の中庭を24×22m、南北の街路を24×10m、側廊を10×24mへ広げ、上層の空中広場を20×8mに絞る。広場と街路を地面の幅で区別し、上層から中庭が見える余白を作る。' };
}

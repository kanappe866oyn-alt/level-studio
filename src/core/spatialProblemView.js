import { SPATIAL_GRID } from './spatialPlan.js';
import { overviewView } from './stageViews.js';
import { PLAYER_EYE_HEIGHT } from './worldScale.js';

export function spatialProblemView(objects, plan, location, fov = 50, aspect = 1) {
  const ids = [...new Set([location.from, location.to].filter(Boolean))];
  const anchors = ids.map(id => plan.areas.find(a => a.id === id));
  if (!anchors.length || anchors.some(a => !a)) throw new Error('問題箇所の設計地点が見つかりません。');
  const frames = anchors.map(a => ({ id: `frame_${a.id}`, pos: [a.gx * SPATIAL_GRID, a.level * 4 + 1.4, a.gz * SPATIAL_GRID], size: [a.width, 2.8, a.depth], rot: [0, 0, 0] }));
  const edited = objects.find(o => o.id === location.objectId);
  // Include both the original endpoints and the moved structure in the frame.
  const frame = overviewView(edited ? [...frames, edited] : frames, fov, aspect);
  const points = anchors.map(a => [a.gx * SPATIAL_GRID, a.level * 4 + PLAYER_EYE_HEIGHT, a.gz * SPATIAL_GRID]);
  return { ...frame, frames, points, label: location.label, kind: location.kind };
}

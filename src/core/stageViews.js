import { getBounds, createSpatialWorld, WALKING } from './spatialGeometry.js';
import { PLAYER_EYE_HEIGHT } from './worldScale.js';
import { segmentHitsBox, spatialEyeSamples } from './spatialSightlines.js';

export function overviewView(objects, fov = 50, aspect = 1, { balance = false } = {}) {
  if (!objects.length) return null;
  const bounds = objects.map(getBounds);
  const min = [Math.min(...bounds.map(b => b.minX)), Math.min(...objects.map(o => o.pos[1] - o.size[1] / 2)), Math.min(...bounds.map(b => b.minZ))];
  const max = [Math.max(...bounds.map(b => b.maxX)), Math.max(...objects.map(o => o.pos[1] + o.size[1] / 2)), Math.max(...bounds.map(b => b.maxZ))];
  const target = min.map((v, i) => (v + max[i]) / 2);
  const direction = [1, 0.85, 1], length = Math.hypot(...direction), d = direction.map(v => v / length);
  const right = [Math.SQRT1_2, 0, -Math.SQRT1_2];
  const up = [-d[1] * Math.SQRT1_2, Math.SQRT2 * d[0], -d[1] * Math.SQRT1_2];
  const tanV = Math.tan(fov * Math.PI / 360) * 0.9, tanH = tanV * aspect;
  let distance = 10;
  const points = [];
  objects.forEach((o, i) => {
    const b = bounds[i];
    for (const x of [b.minX, b.maxX]) for (const z of [b.minZ, b.maxZ]) for (const y of [o.pos[1] - o.size[1] / 2, o.pos[1] + o.size[1] / 2]) {
      const p = [x - target[0], y - target[1], z - target[2]], dot = axis => p.reduce((sum, v, k) => sum + v * axis[k], 0);
      if (balance) points.push({ x: dot(right), y: dot(up), z: dot(d) });
      distance = Math.max(distance, dot(d) + Math.max(Math.abs(dot(right)) / tanH, Math.abs(dot(up)) / tanV) + 2);
    }
  });
  if (balance) {
    const pivotHeight = target[1];
    const intervals = depth => {
      let left = -Infinity, right = Infinity, bottom = -Infinity, top = Infinity;
      for (const p of points) {
        const z = depth - p.z;
        if (z <= 0) return null;
        left = Math.max(left, p.x - tanH * z); right = Math.min(right, p.x + tanH * z);
        bottom = Math.max(bottom, p.y - tanV * z); top = Math.min(top, p.y + tanV * z);
      }
      return left <= right && bottom <= top ? { left, right, bottom, top } : null;
    };
    // Find the closest safe framing while allowing the target to shift within
    // the camera plane. This centres projected geometry rather than a world box.
    let low = 0, high = distance;
    for (let i = 0; i < 48; i++) { const mid = (low + high) / 2; if (intervals(mid)) high = mid; else low = mid; }
    distance = Math.max(10, high + 0.1);
    const fit = intervals(distance);
    const centre = (axis, lower, upper) => {
      for (let i = 0; i < 40; i++) {
        const mid = (lower + upper) / 2;
        let min = Infinity, max = -Infinity;
        for (const p of points) { const v = (p[axis] - mid) / (distance - p.z); min = Math.min(min, v); max = Math.max(max, v); }
        if (min + max > 0) lower = mid; else upper = mid;
      }
      return (lower + upper) / 2;
    };
    const x = centre('x', fit.left, fit.right), y = centre('y', fit.bottom, fit.top);
    for (let i = 0; i < 3; i++) target[i] += right[i] * x + up[i] * y;
    // Move the orbit pivot along the same viewing ray to retain a useful height.
    // Camera position and projection stay identical; the pivot is not underground.
    const along = (pivotHeight - target[1]) / d[1];
    if (distance - along > 1) {
      for (let i = 0; i < 3; i++) target[i] += d[i] * along;
      distance -= along;
    }
  }
  return { position: target.map((v, i) => v + d[i] * distance), target };
}

// Spatial maps keep decorative background and the deep safety foundation, but
// frame the actual playable structures. User-added geometry remains included.
export function spatialOverviewView(objects, fov = 50, aspect = 1) {
  const playable = objects.filter(o => !['sp_ground', 'sp_void', 'sp_terrain_surround'].includes(o.id) &&
    !['backdrop', 'support', 'foundation'].includes(o.spatialAppearance?.category));
  return playable.length ? overviewView(playable, fov, aspect, { balance: true }) : overviewView(objects, fov, aspect);
}

export function walkingViews(objects) {
  const world = createSpatialWorld(objects);
  const markers = [objects.find(o => o.role === 'spawn'), objects.find(o => o.role === 'checkpoint'), objects.find(o => o.role === 'goal')];
  return ['entry', 'rest', 'vista'].map((kind, i) => {
    const marker = markers[i];
    if (!marker) return null;
    const requestedY = marker.pos[1] - marker.size[1] / 2;
    const y = world.floor(marker.pos[0], marker.pos[2], requestedY);
    if (!Number.isFinite(y) || Math.abs(y - requestedY) > WALKING.stepHeight || world.dangerous(marker.pos[0], marker.pos[2], y)) return null;
    const feet = [marker.pos[0], y, marker.pos[2]], position = [feet[0], y + PLAYER_EYE_HEIGHT, feet[2]];
    // Bridges frame the river; the rest viewpoint faces the next ascending stair.
    const candidates = objects.filter(o => i === 1 ? o.role === 'climb' && o.variant !== 2 &&
      Math.abs(o.pos[1] - o.size[1] / 2 - y) <= WALKING.stepHeight : o.role === 'bridge' &&
      Math.abs(o.pos[1] + o.size[1] / 2 - y) <= WALKING.stepHeight);
    const next = candidates.sort((a, b) => Math.hypot(a.pos[0] - feet[0], a.pos[2] - feet[2]) - Math.hypot(b.pos[0] - feet[0], b.pos[2] - feet[2]))[0];
    const target = next ? [next.pos[0], next.pos[1] + PLAYER_EYE_HEIGHT, next.pos[2]] : [feet[0], position[1], feet[2] - 5];
    return { kind, label: ['入口', '休憩地点', '高台'][i], position, feet, target };
  }).filter(Boolean);
}

export function matchingPlayDirection(views, feet) {
  return views.find(v => Math.hypot(...v.feet.map((value, i) => value - feet[i])) < 0.2)?.target;
}

export function spatialWalkingViews(objects, plan) {
  if (!Array.isArray(plan?.areas)) return [];
  const world = createSpatialWorld(objects);
  const centre = plan.areas.find(a => a.id === 'court' && a.kind === 'courtyard') ||
    plan.areas.find(a => a.kind === 'courtyard') || plan.areas.find(a => a.kind === 'goal');
  const high = plan.areas.filter(a => a.kind === 'high').sort((a, b) => b.level - a.level)[0];
  // Market lanes and the terraces' lower garden are open detours. Enclosure
  // alone must not hide their preview; retain the enclosed-room choice first.
  const lane = plan.areas.find(a => a.enclosure === 'walled' && a.kind === 'room') ||
    plan.areas.find(a => a.id === 'lane' && a.kind === 'passage') ||
    plan.areas.find(a => a.id === 'garden' && a.kind === 'courtyard');
  const chosen = [plan.areas.find(a => a.kind === 'entry'), centre, high, lane];
  const steps = new Map(), goal = plan.areas.find(a => a.kind === 'goal');
  if (goal) {
    steps.set(goal.id, 0);
    const queue = [goal.id];
    for (let i = 0; i < queue.length; i++) for (const c of plan.connections) {
      const id = c.from === queue[i] ? c.to : c.to === queue[i] ? c.from : null;
      if (id && !steps.has(id)) { steps.set(id, steps.get(queue[i]) + 1); queue.push(id); }
    }
  }
  return chosen.map((area, i) => {
    const marker = objects.find(o => o.id === `sp_marker_${area?.id}`);
    if (!marker) return null;
    const feetY = marker.pos[1] - marker.size[1] / 2, y = world.floor(marker.pos[0], marker.pos[2], feetY);
    if (!Number.isFinite(y) || Math.abs(y - feetY) > WALKING.stepHeight || world.dangerous(marker.pos[0], marker.pos[2], y)) return null;
    const feet = [marker.pos[0], y, marker.pos[2]], position = [feet[0], y + PLAYER_EYE_HEIGHT, feet[2]];
    // Walking previews face a designed outgoing route, not a diagonal through a
    // wall or whichever connection happens to be first in the JSON. The high
    // viewpoint remains a vista towards the courtyard.
    const neighbours = plan.connections.filter(c => c.from === area.id || c.to === area.id).map(c => plan.areas.find(a => a.id === (c.from === area.id ? c.to : c.from))).filter(a => {
      if (!a) return false;
      const m = objects.find(o => o.id === `sp_marker_${a.id}`);
      if (!m) return false;
      const expected = m.pos[1] - m.size[1] / 2, floor = world.floor(m.pos[0], m.pos[2], expected);
      return Number.isFinite(floor) && Math.abs(floor - expected) <= WALKING.stepHeight && !world.dangerous(m.pos[0], m.pos[2], floor);
    }).sort((a, b) => ((steps.get(a.id) ?? plan.areas.length) - (steps.get(b.id) ?? plan.areas.length)) || b.level - a.level || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const nextId = i === 2 ? centre?.id : neighbours[0]?.id;
    const targetMarker = objects.find(o => o.id === `sp_marker_${nextId}`);
    const target = targetMarker && targetMarker.id !== marker.id ? [targetMarker.pos[0], targetMarker.pos[1] - targetMarker.size[1] / 2 + PLAYER_EYE_HEIGHT, targetMarker.pos[2]] : [feet[0], position[1], feet[2] - 5];
    let scenic;
    if (i === 2 && targetMarker && plan.requirements?.sightlines?.some(s => s.from === area.id && s.to === nextId && s.relation === 'visible') && world.parts.some(o => segmentHitsBox(position, target, o))) {
      const samples = (a, m, height) => spatialEyeSamples({ ...a, x: m.pos[0], y: height, z: m.pos[2] }).sort((p, q) =>
        Math.hypot(p[0] - m.pos[0], p[2] - m.pos[2]) - Math.hypot(q[0] - m.pos[0], q[2] - m.pos[2]));
      const supported = p => {
        const expected = p[1] - PLAYER_EYE_HEIGHT, floor = world.floor(p[0], p[2], expected);
        return Number.isFinite(floor) && Math.abs(floor - expected) < 0.05 && !world.dangerous(p[0], p[2], floor);
      };
      const destination = plan.areas.find(a => a.id === nextId);
      search: for (const p of samples(area, marker, y)) {
        if (!supported(p)) continue;
        for (const q of samples(destination, targetMarker, targetMarker.pos[1] - targetMarker.size[1] / 2)) {
          if (supported(q) && !world.parts.some(o => segmentHitsBox(p, q, o))) {
            scenic = { position: p, feet: [p[0], p[1] - PLAYER_EYE_HEIGHT, p[2]], target: q }; break search;
          }
        }
      }
    }
    return { kind: ['entry', 'rest', 'vista', 'lane'][i], label: ['入口', '中庭', '高台', '裏道'][i], position, feet, target, ...scenic };
  }).filter(Boolean);
}

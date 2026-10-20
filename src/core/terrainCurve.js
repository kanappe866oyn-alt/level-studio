import { getStairLayout } from './assemblySizing.js';

export const CURVE_STEPS = 24;
export const curveOffset = (offset, t) => offset * Math.sin(Math.PI * t) ** 2;
export const connectionWidth = (width, flare = 0, t) => width + 2 * flare * Math.cos(Math.PI * t) ** 2;
export function curvedStairRows(count) {
  const divisions = Math.max(1, Math.ceil(CURVE_STEPS / count)), rows = [];
  for (let step = 0; step < count; step++) for (let j = 0; j <= divisions; j++) rows.push({ t: (step + j / divisions) / count, height: (step + 1) / count });
  return rows;
}
export function fittedCurve(width, curve) {
  const roadWidth = Math.min(width, curve.width), flare = Math.min(curve.flare || 0, Math.max(0, (width - roadWidth) / 2));
  const limit = Math.max(0, (width - roadWidth - 2 * flare) / 2);
  return { width: roadWidth, flare, offset: Math.max(-limit, Math.min(limit, curve.offset)) };
}

// Canonical centre points are shared by walking checks, distance and route views.
// Heights change only between portals; the approaches inside rooms stay level.
export function spatialConnectionPoints(a, b, connection = {}) {
  if (!connection.curve && !connection.flare) return [a, b];
  const from = a.id === connection.from ? a : b, to = from === a ? b : a;
  const axis = from.x === to.x ? 'z' : 'x', extent = axis === 'z' ? 'depth' : 'width';
  const direction = Math.sign(to[axis] - from[axis]);
  const start = from[axis] + direction * from[extent] / 2, end = to[axis] - direction * to[extent] / 2;
  const yaw = Math.atan2(to.x - from.x, to.z - from.z);
  const points = [from];
  const rise = Math.abs(to.y - from.y), stepped = rise > 0 && connection.traversal !== 'ramp';
  const count = stepped ? getStairLayout([connection.width, rise, Math.abs(end - start)]).count : CURVE_STEPS;
  const samples = stepped ? Array.from({ length: count }, (_, i) => (i + 0.5) / count) : Array.from({ length: count + 1 }, (_, i) => i / count);
  for (const t of samples) {
    const offset = curveOffset(connection.curve || 0, t), along = start + (end - start) * t;
    const level = stepped ? (to.y > from.y ? Math.floor(t * count) + 1 : count - Math.floor(t * count)) / count : t;
    points.push({ x: (axis === 'x' ? along : from.x) + Math.cos(yaw) * offset,
      y: stepped ? Math.min(from.y, to.y) + rise * level : from.y + (to.y - from.y) * t,
      z: (axis === 'z' ? along : from.z) - Math.sin(yaw) * offset });
  }
  points.push(to);
  return from === a ? points : points.reverse();
}

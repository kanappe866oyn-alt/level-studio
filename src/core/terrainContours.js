import { CURVE_STEPS, curveOffset, fittedCurve, curvedStairRows, connectionWidth } from './terrainCurve.js';

// Keep a six metre cross through every area for five metre portals and their frames.
export const terrainCornerCut = area => Math.min(1.5, Math.max(0, (Math.min(area.width, area.depth) - 6) / 2));

export function bevelSegments(width, depth, cut) {
  return [-1, 1].flatMap(sx => [-1, 1].map(sz => [
    [sx * (width / 2 - cut), sz * depth / 2],
    [sx * width / 2, sz * (depth / 2 - cut)],
  ]));
}

// Exact perimeter of the straight bevel/taper variants, in object coordinates.
export function terrainContour(object) {
  const [width, , depth] = object.size, p = object.terrainProfile;
  if (p?.curve) {
    const curve = fittedCurve(width, p.curve);
    const samples = p.stepCount ? curvedStairRows(p.stepCount).map(row => row.t).filter((t, i, all) => !i || t - all[i - 1] > 1e-8) : Array.from({ length: CURVE_STEPS + 1 }, (_, i) => i / CURVE_STEPS);
    const points = samples.map(t => {
      return [curveOffset(curve.offset, t), (t - 0.5) * depth, connectionWidth(curve.width, curve.flare, t) / 2];
    });
    return [...points.map(([x, z, half]) => [x + half, z]), ...points.reverse().map(([x, z, half]) => [x - half, z])];
  }
  const cut = Math.min(p?.cornerCut || 0, Math.max(0, width / 2 - 2.5), Math.max(0, depth / 2 - 2.5));
  const x = width / 2, z = depth / 2;
  const points = cut ? [[-x + cut, -z], [x - cut, -z], [x, -z + cut], [x, z - cut], [x - cut, z], [-x + cut, z], [-x, z - cut], [-x, -z + cut]] : [[-x, -z], [x, -z], [x, z], [-x, z]];
  return points.map(([px, pz]) => [px * (p?.widthScale ? p.widthScale[0] * (0.5 - pz / depth) + p.widthScale[1] * (0.5 + pz / depth) : 1), pz]);
}

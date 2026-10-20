import { getBounds, surfaceTop, worldXZ, WALKING } from './spatialGeometry.js';
import { CURVE_STEPS, fittedCurve, curveOffset, connectionWidth } from './terrainCurve.js';

// These are real colliders below the deck, not a painted suggestion of support.
// Reserve the whole lower walking footprint and its standing height, including
// corners, rather than checking only a centre-line ray under the bridge.
export function bridgeMemberHasClearance(member, floors) {
  const b = getBounds(member), bottom = member.pos[1] - member.size[1] / 2, top = member.pos[1] + member.size[1] / 2;
  return !floors.some(f => {
    const a = getBounds(f), gap = WALKING.radius + 0.1;
    if (b.minX >= a.maxX + gap || b.maxX <= a.minX - gap || b.minZ >= a.maxZ + gap || b.maxZ <= a.minZ - gap) return false;
    // A graded floor's highest point gives a conservative clearance bound.
    const low = f.pos[1] + f.size[1] / 2 - (f.terrainProfile?.grade || 0);
    const high = f.pos[1] + f.size[1] / 2;
    return top > low - 0.02 && bottom < high + WALKING.height + 0.2;
  });
}

export function bridgeStructureParts(deck, connection, floors) {
  const bottom = deck.pos[1] - deck.size[1] / 2;
  if (bottom < 1.8 || connection.rise || deck.terrainProfile?.grade) return [];
  const curve = deck.terrainProfile?.curve ? fittedCurve(deck.size[0], deck.terrainProfile.curve) : { width: deck.size[0], flare: 0, offset: 0 };
  const parts = [], samples = curve.offset || curve.flare ? CURVE_STEPS : Math.max(1, Math.ceil(deck.size[2] / 4));
  const point = (t, side) => worldXZ(deck, curveOffset(curve.offset, t) + side * Math.max(0, connectionWidth(curve.width, curve.flare, t) / 2 - 0.45), (t - 0.5) * deck.size[2]);
  const beam = (name, p, q, width, height, top) => {
    const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const member = { id: `${deck.id}_support_${name}`, name: '高架の桁と横桁', role: 'wall', type: 'box', variant: 1, material: 0,
      pos: [(p[0] + q[0]) / 2, top - height / 2, (p[1] + q[1]) / 2], size: [width, height, length + 0.015],
      rot: [0, Math.atan2(q[0] - p[0], q[1] - p[1]), 0], color: '#647a76',
      spatialAppearance: { version: 1, style: 'harbor', surface: 'concrete', district: 'high', category: 'support', moduleId: 'bridge_structure' } };
    if (!bridgeMemberHasClearance(member, floors)) return null;
    return member;
  };
  // A single failed segment rejects the full beam: do not leave a visually
  // disconnected sequence of fragments around an obstructed underpass.
  const longitudinal = [];
  for (const side of [-1, 1]) for (let i = 0; i < samples; i++) {
    const t = i / samples, next = (i + 1) / samples;
    const member = beam(`long_${side}_${i}`, point(t, side), point(next, side), 0.24, 0.32, bottom);
    if (!member) return [];
    // Keep the centre and both ends inside the actual deck, even after a user
    // narrows or bends it. Curves use the same sampled perimeter as the floor.
    for (const [x, z] of [point(t, side), point(next, side)]) if (surfaceTop(deck, x, z) === null) return [];
    longitudinal.push(member);
  }
  parts.push(...longitudinal);
  const count = Math.max(1, Math.ceil(deck.size[2] / 4));
  for (let i = 0; i <= count; i++) {
    const t = (0.65 + (deck.size[2] - 1.3) * i / count) / deck.size[2];
    const member = beam(`cross_${i}`, point(t, -1), point(t, 1), 0.2, 0.18, bottom - 0.08);
    if (member) parts.push(member);
  }
  return parts;
}

// Shape the existing support inside its previous footprint. The capital and
// footing remain full width; the shaft becomes narrower, retaining its centre.
export function articulatedPierParts(pier) {
  const [w, h, d] = pier.size, bottom = pier.pos[1] - h / 2;
  if (h < 0.8) return [pier];
  const base = Math.min(0.4, h * 0.15), cap = Math.min(0.25, h * 0.15);
  const part = (suffix, y, size) => ({ ...pier, id: `${pier.id}_${suffix}`, name: `高架の橋脚・${suffix === 'shaft' ? '柱' : suffix === 'capital' ? '受け材' : '基礎'}`,
    pos: [pier.pos[0], y, pier.pos[2]], size,
    spatialAppearance: { version: 1, style: 'harbor', surface: 'concrete', district: 'high', category: 'support', moduleId: 'bridge_structure' } });
  return [part('footing', bottom + base / 2, [w, base, d]),
    part('shaft', bottom + base + (h - base - cap) / 2, [w * 0.72, h - base - cap, d * 0.72]),
    part('capital', bottom + h - cap / 2, [w, cap, d])];
}

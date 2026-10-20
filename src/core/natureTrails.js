// Trail points are normalized to the terrace, so editor scaling keeps the route aligned.
export function natureTrail(land) {
  const [width, , depth] = land.size;
  const side = -land.terrainProfile.shoreline.side;
  const reach = Math.min(6, width * 0.26);
  const span = Math.min(5, depth * 0.27);
  return { width: 1.8, points: Array.from({ length: 13 }, (_, i) => {
    const angle = -Math.PI / 2 + i / 12 * Math.PI;
    return [side * reach * Math.cos(angle) / width, span * Math.sin(angle) / depth];
  }) };
}

export function trailPoints(land) {
  return (land.terrainProfile?.trail?.points || []).map(([x, z]) => [x * land.size[0], z * land.size[2]]);
}

export function trailDistance(points, x, z) {
  let closest = Infinity;
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    closest = Math.min(closest, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return closest;
}

// Reservations are used only during planting; no extra floor or collision boxes are emitted.
export function trailReservations(land) {
  const points = trailPoints(land), width = land.terrainProfile?.trail?.width;
  return points.slice(1).map(([bx, bz], i) => {
    const [ax, az] = points[i], dx = bx - ax, dz = bz - az;
    return { pos: [land.pos[0] + (ax + bx) / 2, land.pos[1], land.pos[2] + (az + bz) / 2],
      size: [width + 0.7, 1, Math.hypot(dx, dz) + 0.7], rot: [0, Math.atan2(dx, dz), 0] };
  });
}

import { WALKING } from './spatialGeometry.js';

// Position Y is the player's feet. Substeps avoid crossing narrow treads or walls.
export function advanceWalker(world, state, dx, dz, delta) {
  const steps = Math.max(1, Math.ceil(delta / (1 / 120)), Math.ceil(Math.hypot(dx, dz) / 0.08));
  let { x, y, z, vy } = state;
  for (let i = 0; i < steps; i++) {
    for (const [mx, mz] of [[dx / steps, 0], [0, dz / steps]]) {
      const floor = world.floor(x + mx, z + mz, y);
      const nextY = floor >= y - 0.05 ? floor : y;
      if (!world.blocked(x + mx, z + mz, nextY)) {
        x += mx; z += mz;
        if (nextY > y) { y = nextY; vy = 0; }
      }
    }
    vy -= WALKING.gravity * delta / steps;
    const floor = world.floor(x, z, y, 0);
    const nextY = y + vy * delta / steps;
    if (Number.isFinite(floor) && nextY <= floor && y >= floor - 0.001) { y = floor; vy = 0; }
    else y = nextY;
  }
  return { x, y, z, vy };
}

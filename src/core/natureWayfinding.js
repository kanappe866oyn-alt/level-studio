import { sampleTerrain } from './terrainSurface.js';
import { natureTint } from './natureDressing.js';
import { NATURE_PAVING_RISE } from './naturePlaces.js';

const box = (id, name, role, pos, size, color, yaw = 0) => ({ id, name, role, type: 'box', pos, size, rot: [0, yaw, 0], color, variant: 1, material: 0 });

// A small, open chevron lies on the supported floor. Local forward is -Z.
function directionStones(land, label, x, z, floor, yaw = 0, onPaving = false) {
  return [-1, 1].map(sign => {
    const dx = sign * 0.37, dz = 0.37;
    const px = x + dx * Math.cos(yaw) + dz * Math.sin(yaw), pz = z - dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const support = sampleTerrain(land, px - land.pos[0], pz - land.pos[2]);
    if (support === null) throw new Error('方向の石を支える地形がありません。');
    const y = onPaving ? floor : land.pos[1] + support;
    return box(`${land.id}_direction_${sign}`, label, 'corridor',
      [px, y + (onPaving ? 0.05 : 0.025), pz],
      [0.16, onPaving ? 0.1 : 0.15, 0.78], '#cbb574', yaw + sign * Math.PI / 4);
  });
}

// These cues share existing box roles, so they remain editable and export with the stage.
export function buildNatureWayfinding(land, plan, side, level) {
  const [x, , z] = land.pos, depth = land.size[2], top = land.pos[1] + land.size[1] / 2;
  if (level === 2) {
    return side === 0
      ? directionStones(land, '展望地点の橋へ向かう道しるべ', x + 3, z, top, -Math.PI / 2)
      : directionStones(land, '展望広場へ向かう道しるべ', x, z - depth / 4 + 1.9, top + NATURE_PAVING_RISE, 0, true);
  }
  const approachZ = z - depth / 2 + 1.3;
  const objects = directionStones(land, '階段へ向かう道しるべ', x, approachZ + 1, top);
  for (const sign of [-1, 1]) {
    const dx = sign * 2.1, dz = approachZ - z;
    const y = sampleTerrain(land, dx, dz);
    if (y === null) throw new Error('階段の目印を支える地形がありません。');
    const floor = land.pos[1] + y;
    objects.push(box(`${land.id}_stair_post_${sign}`, '上り階段の石の目印', 'wall', [x + dx, floor + 0.675, approachZ], [0.38, 1.35, 0.38], plan.rockColor));
    objects.push(box(`${land.id}_stair_cap_${sign}`, '上り階段の金色の笠石', 'wall', [x + dx, floor + 1.42, approachZ], [0.56, 0.14, 0.56], natureTint('#cbb574', 0.1)));
  }
  return objects;
}

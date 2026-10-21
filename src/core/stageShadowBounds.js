import { Matrix4, Vector3 } from 'three';
import { getBounds } from './spatialGeometry.js';
import { isSpatialLandscapeDecoration } from './stageViews.js';

export function stageShadowBounds(objects, position, target, mapSize = 1024) {
  const casters = objects.filter(o => o.id !== 'sp_void');
  const streets = casters.filter(o => !['sp_ground', 'sp_terrain_surround'].includes(o.id) &&
    !['backdrop', 'foundation'].includes(o.spatialAppearance?.category) && !isSpatialLandscapeDecoration(o));
  if (!casters.length) return null;
  const eye = new Vector3(...position), centre = new Vector3(...target);
  const view = new Matrix4().lookAt(eye, centre, new Vector3(0, 1, 0)).setPosition(eye).invert();
  const corners = object => {
    const b = getBounds(object), points = [];
    for (const x of [b.minX, b.maxX]) for (const z of [b.minZ, b.maxZ])
      for (const y of [object.pos[1] - object.size[1] / 2, object.pos[1] + object.size[1] / 2])
        points.push(new Vector3(x, y, z).applyMatrix4(view));
    return points;
  };
  const points = (streets.length ? streets : casters).flatMap(corners);
  // Reserve a shoulder around the town; mountains remain shadow casters whenever
  // their light-space silhouette overlaps these receivers. Keep their full depth.
  const margin = 8;
  const left = Math.min(...points.map(p => p.x)) - margin, right = Math.max(...points.map(p => p.x)) + margin;
  const bottom = Math.min(...points.map(p => p.y)) - margin, top = Math.max(...points.map(p => p.y)) + margin;
  const depths = casters.flatMap(corners).map(p => -p.z);
  const near = Math.max(0.5, Math.min(...depths) - margin), far = Math.max(near + 1, Math.max(...depths) + margin);
  const texel = Math.max(right - left, top - bottom) / mapSize;
  return { left, right, bottom, top, near, far, texel,
    normalBias: Math.min(0.12, Math.max(0.035, texel * 0.9)),
    // Shadow bias is normalized by the depth range. Express the offset in world
    // metres first so distant mountains cannot amplify it or cause acne.
    bias: -Math.min(0.16, texel * 1.1) / (far - near) };
}

import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Color } from 'three';
import { boxSurfaceUVs } from './natureAppearance.js';
import { railingParts, isSpatialRailing } from './railingParts.js';

export const hasSpatialWallCourses = object => object.role === 'wall' && object.type === 'box' && !object.customModelUrl && !isSpatialRailing(object) && object.spatialAppearance?.edgeTrim === true;
export const hasSpatialWallPanels = object => hasSpatialWallCourses(object) && object.id?.startsWith('sp_') &&
  object.spatialAppearance?.category === 'structure' && ['stucco', 'brick'].includes(object.spatialAppearance.surface) &&
  object.size[1] >= 1.4 && Math.max(object.size[0], object.size[2]) >= 2.4 && Math.min(object.size[0], object.size[2]) <= 0.7;
export const hasMutedRailingPosts = object => isSpatialRailing(object) && object.id?.startsWith('sp_') && object.spatialAppearance?.category === 'structure';

export function createSpatialRailingGeometry(size, colors, direction, mutedPosts = false) {
  const positions = [], normals = [], values = [];
  for (const part of railingParts(size, direction)) {
    const box = new BoxGeometry(...part.size), mesh = box.toNonIndexed();
    mesh.translate(...part.pos);
    positions.push(...mesh.attributes.position.array); normals.push(...mesh.attributes.normal.array);
    const color = new Color(colors[part.band]);
    if (mutedPosts && part.name.startsWith('post_')) color.copy(new Color(colors[2]).lerp(new Color('#d8d7cb'), 0.55));
    for (let i = 0; i < mesh.attributes.position.count; i++) color.toArray(values, values.length);
    box.dispose(); mesh.dispose();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(values, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(boxSurfaceUVs(positions, normals, 2), 2));
  return geometry;
}

// Three painted courses share one closed box, with the exact original bounds.
// No protruding trim or duplicate coplanar surface is introduced.
export function spatialWallCourseHeights(height) {
  return [Math.min(0.14, height / 5), Math.min(0.18, height / 4)];
}

export function createSpatialWallGeometry(size, colors, panels = false) {
  const [width, height, depth] = size;
  panels = panels && height >= 1.4 && Math.max(width, depth) >= 2.4 && Math.min(width, depth) <= 0.7;
  const [crown, originalFoot] = spatialWallCourseHeights(height), foot = panels ? Math.min(0.65, height * 0.22) : originalFoot;
  const along = width >= depth ? 0 : 2, length = size[along];
  const bays = Math.max(1, Math.min(32, Math.round(length / 3.2))), edges = [-length / 2];
  if (panels) {
    edges.push(-length / 2 + 0.14);
    for (let i = 1; i < bays; i++) edges.push(-length / 2 + i * length / bays - 0.14, -length / 2 + i * length / bays + 0.14);
    edges.push(length / 2 - 0.14, length / 2);
  }
  const segments = panels ? edges.length - 1 : 1;
  const g = new BoxGeometry(width, height, depth, along === 0 ? segments : 1, 3, along === 2 ? segments : 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const row = Math.round((p.getY(i) / height + 0.5) * 3);
    p.setY(i, [-height / 2, -height / 2 + foot, height / 2 - crown, height / 2][row]);
    if (panels) p.setComponent(i, along, edges[Math.round((p.getComponent(i, along) / length + 0.5) * segments)]);
  }
  const indices = [[], [], []];
  for (let i = 0; i < g.index.count; i += 3) {
    const triangle = [0, 1, 2].map(k => g.index.getX(i + k));
    const y = triangle.reduce((sum, index) => sum + p.getY(index), 0) / 3;
    const band = y >= height / 2 - crown - 1e-7 ? 1 : y <= -height / 2 + foot + 1e-7 ? 2 : 0;
    indices[band].push(...triangle);
  }
  g.setIndex(indices.flat()); g.clearGroups();
  let start = 0;
  indices.forEach((group, materialIndex) => { g.addGroup(start, group.length, materialIndex); start += group.length; });
  g.setAttribute('uv', new Float32BufferAttribute(boxSurfaceUVs(p.array, g.attributes.normal.array, 2), 2));
  if (colors) {
    // Split vertex ownership at colour boundaries, not the physical surface.
    // One material avoids three draw calls per short wall.
    const painted = g.toNonIndexed(), values = new Float32Array(painted.attributes.position.count * 3);
    for (const group of painted.groups) {
      const color = new Color(colors[group.materialIndex]);
      if (panels && group.materialIndex === 2) color.lerp(new Color(colors[0]), 0.45);
      const pier = new Color(colors[0]).lerp(new Color('#e3dcc8'), 0.42);
      for (let i = group.start; i < group.start + group.count; i += 3) {
        const coordinate = [0, 1, 2].reduce((sum, k) => sum + painted.attributes.position.getComponent(i + k, along), 0) / 3;
        const relative = (coordinate + length / 2) * bays / length;
        const atPier = panels && group.materialIndex === 0 && Math.abs(painted.attributes.normal.getComponent(i, along)) < 0.1 &&
          Math.abs(relative - Math.round(relative)) * length / bays < 0.141;
        for (let k = 0; k < 3; k++) (atPier ? pier : color).toArray(values, (i + k) * 3);
      }
    }
    painted.setAttribute('color', new Float32BufferAttribute(values, 3));
    g.dispose(); return painted;
  }
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

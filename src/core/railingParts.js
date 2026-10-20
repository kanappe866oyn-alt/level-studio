export const isSpatialRailing = o => o.role === 'wall' && o.type === 'box' && !o.customModelUrl && o.spatialAppearance?.railing === true;

// The base curb, top rail and posts are shared by drawing, collision and rays.
export function railingParts(size, direction) {
  const axis = direction === 'z' ? 2 : direction === 'x' ? 0 : size[0] >= size[2] ? 0 : 2, normal = axis === 0 ? 2 : 0;
  const length = size[axis], height = size[1], beam = Math.min(0.12, height * 0.15);
  const post = Math.min(0.12, length / 3), thickness = Math.min(0.12, size[normal]);
  const parts = [];
  const add = (name, along, y, span, h, depth, band) => {
    const pos = [0, y, 0], dimensions = [...size]; pos[axis] = along;
    dimensions[axis] = span; dimensions[1] = h; dimensions[normal] = depth;
    parts.push({ name, pos, size: dimensions, band });
  };
  add('base', 0, -height / 2 + beam / 2, length, beam, size[normal], 2);
  add('top', 0, height / 2 - beam / 2, length, beam, thickness, 1);
  const intervals = Math.max(1, Math.min(64, Math.ceil(length / 2)));
  for (let i = 0; i <= intervals; i++) add(`post_${i}`, (i / intervals - 0.5) * (length - post), 0, post, height - 2 * beam, thickness, 1);
  return parts;
}

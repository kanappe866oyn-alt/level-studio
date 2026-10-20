import { Box3, Vector3 } from 'three';

// Include child transforms (including Blender Empty parents), but not hidden colliders.
export function measureVisibleModel(scene) {
  scene.updateWorldMatrix(true, true);
  const bounds = new Box3();
  scene.traverseVisible(child => {
    if (!child.isMesh || child.name.includes('Collider_Stairs')) return;
    bounds.union(new Box3().setFromObject(child, true));
  });
  if (bounds.isEmpty()) return null;
  const size = bounds.getSize(new Vector3()).toArray();
  if (size.some(value => !Number.isFinite(value) || value <= 0)) return null;
  return { size, center: bounds.getCenter(new Vector3()).toArray(), minY: bounds.min.y };
}

export function applyNativeModelSize(obj, path, size, defaultScale = 1) {
  const sameModel = obj.modelDimensions?.path === path;
  const previousScale = obj.modelDimensions?.defaultScale ?? 1;
  if (sameModel && previousScale === defaultScale) return obj;
  const targetSize = sameModel
    ? obj.size.map(value => value * defaultScale / previousScale)
    : size.map(value => value * defaultScale);
  const bottomY = obj.pos[1] - obj.size[1] / 2;
  return {
    ...obj,
    size: targetSize,
    pos: [obj.pos[0], bottomY + targetSize[1] / 2, obj.pos[2]],
    modelDimensions: { path, size: [...size], defaultScale },
  };
}

export function getNativeModelTransform(objSize, bounds, initialized) {
  const scale = bounds.size.map((value, axis) => initialized ? objSize[axis] / value : 1);
  return {
    scale,
    position: [
      -bounds.center[0] * scale[0],
      -objSize[1] / 2 - bounds.minY * scale[1],
      -bounds.center[2] * scale[2],
    ],
  };
}

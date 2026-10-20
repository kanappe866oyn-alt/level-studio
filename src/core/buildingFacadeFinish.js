import { Color, DataTexture, Float32BufferAttribute, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import { supportsBuildingColors } from './buildingAppearance.js';

const resources = new WeakMap();
const materialNames = ['Warm plaster | house', 'Slate blue | wall', 'Desaturated teal | base'];
export function isNativeFacadeWall(mesh) {
  return mesh.isMesh && /^(?:Upper[ _])?Wall[ _](rear|left)(?:[._]?\d+)?$/i.test(mesh.name) &&
    !Array.isArray(mesh.material) && materialNames.includes(mesh.material?.name);
}

// Closed, opaque windows are painted on the existing solid wall, never made
// into an opening. The native building's envelope and colliders stay intact.
export function buildingFacadePixels(wall, trim, columns, width = 512, height = 256) {
  const bytes = new Uint8Array(width * height * 4);
  const plaster = new Color(wall), accent = new Color(trim), frame = new Color('#dfd4bd'), glass = new Color('#547f91');
  const paint = color => color.clone().convertLinearToSRGB().toArray().map(n => Math.round(n * 255));
  const base = paint(plaster), band = paint(plaster.clone().lerp(accent, 0.38)), edge = paint(accent), border = paint(frame), pane = paint(glass);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = (x + 0.5) / width, v = (y + 0.5) / height;
    let rgb = base;
    if (v < 0.14) rgb = band;
    if (v > 0.94 || v > 0.13 && v < 0.15) rgb = edge;
    const bay = (u * columns) % 1;
    if (bay < 0.035 || bay > 0.965) rgb = band;
    if (bay > 0.22 && bay < 0.78 && v > 0.33 && v < 0.83) {
      rgb = bay < 0.26 || bay > 0.74 || v < 0.37 || v > 0.79 || Math.abs(bay - 0.5) < 0.017 ? border : pane;
      if (v > 0.55 && v < 0.57) rgb = border;
    }
    const offset = (y * width + x) * 4, noise = rgb === base ? ((x * 13 + y * 29) % 5) - 2 : 0;
    for (let k = 0; k < 3; k++) bytes[offset + k] = Math.max(0, Math.min(255, rgb[k] + noise));
    bytes[offset + 3] = 255;
  }
  return bytes;
}

export function finishNativeBuildingFacades(root, object, colors, { overridden = false } = {}) {
  if (!supportsBuildingColors(object) || overridden) return 0;
  const textures = new Map(), geometries = [];
  let walls = 0;
  root.traverse(mesh => {
    if (!isNativeFacadeWall(mesh)) return;
    const geometry = mesh.geometry.clone(); geometry.computeBoundingBox();
    const bounds = geometry.boundingBox, axis = bounds.max.x - bounds.min.x >= bounds.max.z - bounds.min.z ? 0 : 2;
    const length = bounds.max.getComponent(axis) - bounds.min.getComponent(axis), height = bounds.max.y - bounds.min.y;
    if (!(length > 0 && height > 0)) { geometry.dispose(); return; }
    const positions = geometry.attributes.position, uv = new Float32Array(positions.count * 2);
    for (let i = 0; i < positions.count; i++) {
      uv[i * 2] = (positions.getComponent(i, axis) - bounds.min.getComponent(axis)) / length;
      uv[i * 2 + 1] = (positions.getY(i) - bounds.min.y) / height;
    }
    geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    const columns = Math.max(1, Math.min(4, Math.round(length * mesh.scale.getComponent(axis) / 1.7)));
    const wall = `#${mesh.material.color.getHexString()}`, trim = colors[2] || '#497b78', key = `${wall}:${trim}:${columns}`;
    if (!textures.has(key)) {
      const texture = new DataTexture(buildingFacadePixels(wall, trim, columns), 512, 256);
      texture.name = `building:facade:${key}`; texture.colorSpace = SRGBColorSpace;
      texture.generateMipmaps = true; texture.minFilter = LinearMipmapLinearFilter; texture.magFilter = LinearFilter;
      texture.needsUpdate = true; textures.set(key, texture);
    }
    mesh.geometry = geometry; geometries.push(geometry);
    mesh.material.map = textures.get(key); mesh.material.color.set('#ffffff'); mesh.material.needsUpdate = true;
    walls++;
  });
  resources.set(root, { textures: [...textures.values()], geometries });
  return walls;
}

export function disposeNativeBuildingFacades(root) {
  const owned = resources.get(root);
  if (!owned) return;
  owned.textures.forEach(texture => texture.dispose()); owned.geometries.forEach(geometry => geometry.dispose());
  resources.delete(root);
}

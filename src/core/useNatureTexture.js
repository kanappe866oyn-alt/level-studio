import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { natureTexturePixels, natureNormalPixels } from './natureAppearance.js';

export function useNatureTexture(kind, normal = false) {
  const texture = useMemo(() => {
    const map = new THREE.DataTexture(normal ? natureNormalPixels(kind) : natureTexturePixels(kind), 128, 128, THREE.RGBAFormat);
    map.name = `nature:${kind}:${normal ? 'normal' : 'color'}`;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.colorSpace = normal ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true; map.anisotropy = 4; map.needsUpdate = true;
    return map;
  }, [kind, normal]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

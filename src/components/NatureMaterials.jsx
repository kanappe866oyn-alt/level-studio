import React, { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { boxSurfaceUVs } from '../core/natureAppearance.js';
import { useNatureTexture } from '../core/useNatureTexture.js';

export function NaturePaving({ obj, kind = 'paving' }) {
  const texture = useNatureTexture(kind);
  const normal = useNatureTexture(kind, true);
  const geometry = useMemo(() => {
    const mesh = new THREE.BoxGeometry(...obj.size);
    mesh.setAttribute('uv', new THREE.Float32BufferAttribute(boxSurfaceUVs(mesh.attributes.position.array, mesh.attributes.normal.array), 2));
    return mesh;
  }, [obj]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} castShadow receiveShadow><meshStandardMaterial map={texture} normalMap={normal} color={obj.color} roughness={kind === 'wood' ? 0.86 : 0.9} /></mesh>;
}

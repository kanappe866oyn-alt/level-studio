import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { measureVisibleModel } from '../core/modelSizing';
import { getCharacterTransform } from '../core/worldScale';

export default function ReferenceCharacter() {
  const { scene } = useGLTF('/dummy.glb');
  const model = useMemo(() => scene.clone(), [scene]);
  const transform = useMemo(() => {
    const bounds = measureVisibleModel(scene);
    return bounds ? getCharacterTransform(bounds) : { scale: 1, position: [0, 0, 0] };
  }, [scene]);
  return <group position={transform.position} scale={transform.scale}><primitive object={model} /></group>;
}

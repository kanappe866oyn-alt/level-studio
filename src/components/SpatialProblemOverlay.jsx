import { Line } from '@react-three/drei';

export default function SpatialProblemOverlay({ view }) {
  if (!view) return null;
  return <group>
    {view.frames.map(f => <mesh key={f.id} position={f.pos} renderOrder={10}>
      <boxGeometry args={f.size} />
      <meshBasicMaterial color="#ffcf57" wireframe depthTest={false} transparent opacity={0.85} />
    </mesh>)}
    {view.points.length === 2 && <Line points={view.points} color={view.kind === 'sight' ? '#ff71cf' : '#ffcf57'} lineWidth={3} depthTest={false} dashed dashSize={0.8} gapSize={0.5} />}
  </group>;
}

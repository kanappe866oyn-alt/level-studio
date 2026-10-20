import { Line } from '@react-three/drei';

export default function SpatialRouteOverlay({ routes }) {
  return <group>{routes.map(route => <Line key={route.id} points={route.points} color={route.color} lineWidth={5} depthTest={false} depthWrite={false} renderOrder={20} />)}</group>;
}

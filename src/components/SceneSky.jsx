import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BackSide, Color, Vector3 } from 'three';

const vertexShader = `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform vec3 horizon;
  uniform vec3 zenith;
  uniform vec3 glow;
  uniform vec3 sunDir;
  varying vec3 vDir;
  void main() {
    float h = clamp(vDir.y, 0.0, 1.0);
    vec3 col = mix(horizon, zenith, pow(h, 0.55));
    float s = max(dot(normalize(vDir), sunDir), 0.0);
    col += glow * (pow(s, 6.0) * 0.18 + pow(s, 64.0) * 0.45);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Sky dome whose horizon colour equals the fog colour, so distant terrain
// fades into the sky instead of a flat background.
export default function SceneSky({ horizon, zenith = '#6f9bc4', glow = '#ffe2b0', sun = [-0.45, 0.7, 0.35], radius = 800 }) {
  const group = useRef();
  const uniforms = useMemo(() => ({
    horizon: { value: new Color(horizon) },
    zenith: { value: new Color(zenith) },
    glow: { value: new Color(glow) },
    sunDir: { value: new Vector3(...sun).normalize() },
  }), [horizon, zenith, glow, sun]);
  useFrame(({ camera }) => group.current?.position.copy(camera.position));
  return <group ref={group}>
    <mesh renderOrder={-1000} frustumCulled={false} raycast={() => null}>
      <sphereGeometry args={[radius, 32, 16]} />
      <shaderMaterial side={BackSide} depthWrite={false} fog={false} uniforms={uniforms}
        vertexShader={vertexShader} fragmentShader={fragmentShader} />
    </mesh>
  </group>;
}

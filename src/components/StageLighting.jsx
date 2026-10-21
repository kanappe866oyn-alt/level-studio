import React, { useMemo } from 'react';
import { Object3D } from 'three';
import EnvironmentLighting from './EnvironmentLighting';
import { natureLightingBounds } from '../core/natureAppearance.js';
import { stageShadowBounds } from '../core/stageShadowBounds.js';

export default function StageLighting({ objects, natural, spatial = false, landscape = false, quality }) {
  const settings = useMemo(() => natural || spatial ? natureLightingBounds(objects) : null, [objects, natural, spatial]);
  const sun = settings ? [settings.centre[0] - settings.span * 0.45, settings.centre[1] + settings.span * 0.7, settings.centre[2] + settings.span * 0.35] : null;
  const shadows = useMemo(() => landscape && settings ? stageShadowBounds(objects,
    [settings.centre[0] - settings.span * 0.45, settings.centre[1] + settings.span * 0.7, settings.centre[2] + settings.span * 0.35],
    settings.centre, quality.shadowSize) : null, [landscape, settings, objects, quality.shadowSize]);
  const target = useMemo(() => {
    const object = new Object3D();
    if (settings) object.position.set(...settings.centre);
    return object;
  }, [settings]);
  if (!natural && !spatial) return <>
    <EnvironmentLighting />
    <ambientLight intensity={0.5} />
    <directionalLight key={quality.shadowSize} castShadow={quality.shadows} position={[15, 25, 15]} intensity={1.5} shadow-mapSize={[quality.shadowSize, quality.shadowSize]} shadow-bias={-0.0005} />
  </>;
  const { centre, radius, span } = settings;
  return <>
    <primitive object={target} />
    <hemisphereLight args={['#c6d8e6', '#706452', landscape ? 1.35 : 2]} />
    <ambientLight color="#dbe6df" intensity={landscape ? 0.22 : 0.35} />
    {landscape && <directionalLight color="#b9d8ea" intensity={0.45} target={target}
      position={[centre[0] + span * 0.5, centre[1] + span * 0.3, centre[2] - span * 0.4]} />}
    <directionalLight key={quality.shadowSize} castShadow={quality.shadows} color="#fff1d8" intensity={landscape ? 2.8 : 2.2} target={target}
      position={sun}
      shadow-mapSize={[quality.shadowSize, quality.shadowSize]} shadow-bias={shadows?.bias ?? -0.00015} shadow-normalBias={shadows?.normalBias ?? (spatial ? 0.12 : 0.04)}
      shadow-camera-left={shadows?.left ?? -radius} shadow-camera-right={shadows?.right ?? radius} shadow-camera-top={shadows?.top ?? radius} shadow-camera-bottom={shadows?.bottom ?? -radius}
      shadow-camera-near={shadows?.near ?? 0.5} shadow-camera-far={shadows?.far ?? span * 3} />
  </>;
}

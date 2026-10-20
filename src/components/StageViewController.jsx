import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { overviewView, spatialOverviewView } from '../core/stageViews.js';
import { spatialProblemView } from '../core/spatialProblemView.js';

export default function StageViewController({ objects, views, request, natural, spatial = false, playing }) {
  const { camera, controls, size } = useThree();
  const applied = useRef(null);
  const appliedControls = useRef(null);
  const appliedSize = useRef(null);
  useEffect(() => {
    const resizedOverview = request?.kind === 'overview' && (appliedSize.current?.width !== size.width || appliedSize.current?.height !== size.height);
    if (!natural || playing || !controls || !request || (applied.current === request && appliedControls.current === controls && !resizedOverview)) return;
    const aspect = size.width / Math.max(1, size.height);
    const view = request.kind === 'problem' ? spatialProblemView(objects, request.plan, request.location, camera.fov, aspect) : request.kind === 'overview' ? (spatial ? spatialOverviewView : overviewView)(objects, camera.fov, aspect) : views.find(v => v.kind === request.kind);
    if (!view) return;
    camera.position.set(...view.position);
    camera.up.set(0, 1, 0);
    controls.target.set(...view.target);
    camera.lookAt(...view.target); controls.update();
    applied.current = request;
    appliedControls.current = controls;
    appliedSize.current = { width: size.width, height: size.height };
  }, [objects, views, request, natural, spatial, playing, camera, controls, size.width, size.height]);
  return null;
}

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';
import { PLAYER_EYE_HEIGHT } from '../core/worldScale';
import { createSpatialWorld, WALKING } from '../core/spatialGeometry';
import { advanceWalker } from '../core/walkingPhysics';
import { createPlayProgress } from '../core/playProgress';

export default function FPSController({ objects, startPos, startLookAt, onLock, onUnlock, onProgress }) {
  const { camera, gl } = useThree();
  const controlsRef = useRef();
  const world = useMemo(() => createSpatialWorld(objects), [objects]);  const velocityY = useRef(0);
  const progress = useRef();
  const direction = useRef(new THREE.Vector3());
  const keys = useRef({ forward: false, backward: false, left: false, right: false });
  const resetKeys = () => { keys.current = { forward: false, backward: false, left: false, right: false }; };

  useEffect(() => {
    const floor = world.floor(startPos[0], startPos[2], startPos[1]);
    const y = Number.isFinite(floor) && Math.abs(floor - startPos[1]) <= WALKING.stepHeight ? floor : startPos[1];
    camera.getWorldDirection(direction.current);
    direction.current.y = 0; direction.current.normalize();
    if (direction.current.lengthSq() < 0.1) direction.current.set(0, 0, -1);
    camera.position.set(startPos[0], y + PLAYER_EYE_HEIGHT, startPos[2]);
    if (startLookAt) camera.lookAt(...startLookAt);
    else camera.lookAt(camera.position.x + direction.current.x, camera.position.y, camera.position.z + direction.current.z);
    progress.current = createPlayProgress(objects, world, [startPos[0], y, startPos[2]]);
    onProgress?.(progress.current.arrive([startPos[0], y, startPos[2]]) || progress.current.snapshot());
    velocityY.current = 0;
    resetKeys();
    const mapping = { KeyW: 'forward', ArrowUp: 'forward', KeyS: 'backward', ArrowDown: 'backward', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
    const down = e => { if (mapping[e.code]) { e.preventDefault(); keys.current[mapping[e.code]] = true; } };
    const up = e => { if (mapping[e.code]) keys.current[mapping[e.code]] = false; };
    document.addEventListener('keydown', down);
    document.addEventListener('keyup', up);
    window.addEventListener('blur', resetKeys);
    const timer = setTimeout(() => { try { controlsRef.current?.lock(); } catch { /* click to lock */ } }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', down);
      document.removeEventListener('keyup', up);
      window.removeEventListener('blur', resetKeys);
    };
  }, [camera, startPos, startLookAt, world, objects, onProgress]);

  useFrame((_, deltaRaw) => {
    if (!controlsRef.current?.isLocked) return;
    const delta = Math.min(deltaRaw, 0.05);
    const forward = Number(keys.current.forward) - Number(keys.current.backward);
    const right = Number(keys.current.right) - Number(keys.current.left);
    camera.getWorldDirection(direction.current);
    direction.current.y = 0;
    direction.current.normalize();
    const distance = WALKING.speed * delta / Math.max(1, Math.hypot(forward, right));
    const state = advanceWalker(world, { x: camera.position.x, y: camera.position.y - PLAYER_EYE_HEIGHT, z: camera.position.z, vy: velocityY.current },
      (direction.current.x * forward - direction.current.z * right) * distance,
      (direction.current.z * forward + direction.current.x * right) * distance, delta);
    camera.position.set(state.x, state.y + PLAYER_EYE_HEIGHT, state.z);
    velocityY.current = state.vy;
    if (state.y < -30 || world.dangerous(state.x, state.z, state.y)) {
      const recovery = progress.current.recover();
      camera.position.set(recovery.feet[0], recovery.feet[1] + PLAYER_EYE_HEIGHT, recovery.feet[2]);
      velocityY.current = 0;
      resetKeys();
      onProgress?.(recovery.progress);
    } else {
      const update = progress.current.arrive([state.x, state.y, state.z]);
      if (update) onProgress?.(update);
    }
  });
  return <PointerLockControls ref={controlsRef} onLock={onLock} onUnlock={() => { resetKeys(); onUnlock?.(); }} args={[camera, gl.domElement]} />;
}

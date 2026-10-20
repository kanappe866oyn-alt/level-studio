import React, { useMemo, useEffect, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { spatialTexturePixels, spatialLabelKind } from '../core/spatialAppearance.js';
import { boxSurfaceUVs } from '../core/natureAppearance.js';
import { createSpatialWallGeometry, createSpatialRailingGeometry, hasSpatialWallCourses } from '../core/spatialWallGeometry.js';
import { isSpatialRailing } from '../core/railingParts.js';

const textures = new Map();
function surfaceTexture(kind) {
  if (!textures.has(kind)) {
    const texture = new THREE.DataTexture(spatialTexturePixels(kind), 128, 128);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true;
    textures.set(kind, texture);
  }
  return textures.get(kind);
}
export function SpatialBoxGeometry({ size, untiled = false, labelTopOnly = false, wallColors = null, railColors = null, railAxis, wallPanels = false, mutedPosts = false }) {
  const [x, y, z] = size;
  const geometry = useMemo(() => {
    if (railColors) return createSpatialRailingGeometry([x, y, z], railColors.split(','), railAxis, mutedPosts);
    if (wallColors) return createSpatialWallGeometry([x, y, z], wallColors.split(','), wallPanels);
    const g = new THREE.BoxGeometry(x, y, z);
    if (!untiled) g.setAttribute('uv', new THREE.Float32BufferAttribute(boxSurfaceUVs(g.attributes.position.array, g.attributes.normal.array, 2), 2));
    if (labelTopOnly) g.groups.forEach((group, face) => { group.materialIndex = face === 2 ? 1 : 0; });
    return g;
  }, [x, y, z, untiled, labelTopOnly, wallColors, railColors, railAxis, wallPanels, mutedPosts]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <primitive object={geometry} attach="geometry" />;
}
export function SpatialMaterial({ obj, selected = false }) {
  const paintedWall = hasSpatialWallCourses(obj) || isSpatialRailing(obj);
  const surface = obj.spatialAppearance.surface;
  const labelKind = spatialLabelKind(obj);
  const label = labelKind ? obj.spatialAppearance.label : null;
  const width = obj.size[0], depth = obj.size[2];
  const labelTexture = useMemo(() => {
    if (!label) return null;
    if (labelKind === 'floor') {
      const resolution = 512;
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = resolution;
      const context = canvas.getContext('2d');
      if (!context) return null;
      const tile = document.createElement('canvas'); tile.width = tile.height = 128;
      const tileContext = tile.getContext('2d');
      if (!tileContext) return null;
      const pixels = tileContext.createImageData(128, 128); pixels.data.set(spatialTexturePixels(surface)); tileContext.putImageData(pixels, 0, 0);
      const tileWidth = resolution * 2 / width, tileHeight = resolution * 2 / depth;
      for (let y = 0; y < resolution; y += tileHeight) for (let x = 0; x < resolution; x += tileWidth) context.drawImage(tile, x, y, tileWidth, tileHeight);
      context.globalCompositeOperation = 'multiply'; context.fillStyle = obj.color; context.fillRect(0, 0, resolution, resolution); context.globalCompositeOperation = 'source-over';
      const plateWidth = resolution * Math.min(4, width - 1) / width, plateHeight = resolution * 1.25 / depth;
      const left = (resolution - plateWidth) / 2, top = resolution / 4 - plateHeight / 2;
      context.fillStyle = '#263e49'; context.fillRect(left, top, plateWidth, plateHeight);
      context.strokeStyle = '#fff2cc'; context.lineWidth = 4; context.strokeRect(left + 3, top + 3, plateWidth - 6, plateHeight - 6);
      let fontSize = Math.min(80, plateHeight * 0.65);
      const setFont = () => { context.font = `700 ${fontSize}px "Yu Gothic", "Meiryo", sans-serif`; };
      setFont(); while (context.measureText(label).width > plateWidth - 32 && fontSize > 12) { fontSize--; setFont(); }
      context.fillStyle = '#fff7e3'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(label, resolution / 2, resolution / 4, plateWidth - 32);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    }
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#284f55'; context.fillRect(0, 0, 512, 96);
    context.strokeStyle = '#d9b977'; context.lineWidth = 5; context.strokeRect(4, 4, 504, 88);
    let fontSize = 42;
    const setFont = () => { context.font = `600 ${fontSize}px "Yu Gothic", "Meiryo", sans-serif`; };
    setFont(); while (context.measureText(label).width > 470 && fontSize > 12) { fontSize--; setFont(); }
    context.fillStyle = '#fff6de'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(label, 256, 50, 470);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, [label, labelKind, surface, obj.color, width, depth]);
  useEffect(() => () => labelTexture?.dispose(), [labelTexture]);
  const common = useMemo(() => ({ roughness: surface === 'metal' ? 0.58 : 0.88, metalness: surface === 'metal' ? 0.28 : 0,
    emissive: selected ? '#ffff00' : '#000000', emissiveIntensity: selected ? 0.35 : 0,
    polygonOffset: obj.spatialAppearance.category === 'trim', polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), [surface, selected, obj.spatialAppearance.category]);
  const floorMaterials = useMemo(() => labelKind !== 'floor' ? null : [
    new THREE.MeshStandardMaterial({ ...common, map: surfaceTexture('concrete'), color: '#858b81' }),
    new THREE.MeshStandardMaterial({ ...common, map: labelTexture || surfaceTexture(surface), color: labelTexture ? '#ffffff' : obj.color }),
  ], [common, labelKind, labelTexture, surface, obj.color]);
  useEffect(() => () => floorMaterials?.forEach(material => material.dispose()), [floorMaterials]);
  const wallMaterial = useMemo(() => paintedWall ? new THREE.MeshStandardMaterial({ ...common, vertexColors: true, map: surfaceTexture(surface), color: '#ffffff' }) : null, [paintedWall, common, surface]);
  useEffect(() => () => wallMaterial?.dispose(), [wallMaterial]);
  // Imports can replace geometry before the material's next render pass.
  useLayoutEffect(() => { if (wallMaterial) wallMaterial.needsUpdate = true; }, [wallMaterial, obj]);
  if (wallMaterial) return <primitive attach="material" object={wallMaterial} />;
  if (floorMaterials) return <primitive attach="material" object={floorMaterials} />;
  return <meshStandardMaterial {...common} map={labelTexture || surfaceTexture(surface)} color={labelTexture ? '#ffffff' : obj.color} />;
}

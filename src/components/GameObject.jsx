// src/components/GameObject.jsx
import React, { useRef, useMemo, Suspense } from 'react';
import { useGLTF, TransformControls, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { measureVisibleModel, getNativeModelTransform } from '../core/modelSizing';
import { usesNativeSizing, getModelDefault } from '../core/modelCatalog';
import { getStairLayout } from '../core/assemblySizing';
import { terrainMeshData } from '../core/terrainSurface';
import { riverMeshData } from '../core/riverSurface';
import { planarUVs, terrainSurfaceUVs, terrainSurfaceColors, terrainMasonryColors, riverSurfaceColors } from '../core/natureAppearance.js';
import { NaturePaving } from './NatureMaterials';
import { useNatureTexture } from '../core/useNatureTexture.js';
import { finishNatureModelMaterial } from '../core/natureModelFinish.js';
import { supportsBuildingColors, finishBuildingMaterial } from '../core/buildingAppearance.js';
import { finishNativeBuildingFacades, disposeNativeBuildingFacades } from '../core/buildingFacadeFinish.js';
import { clamp, SEMANTIC_PREFABS, getModelPath } from '../core/rules';
import { SpatialBoxGeometry, SpatialMaterial } from './SpatialMaterials.jsx';
import { spatialLabelKind } from '../core/spatialAppearance.js';
import { hasSpatialWallCourses, hasSpatialWallPanels, hasMutedRailingPosts } from '../core/spatialWallGeometry.js';
import { isSpatialRailing } from '../core/railingParts.js';
import { TERRAIN_DISTRICTS } from '../core/terrainMaterials.js';
import { rockStrataColors, finishRockStrataGeometry } from '../core/rockStrataGeometry.js';

// ============================================================================
// CustomModel：GLB読み込み＋色・テクスチャ上書き（ロジックは既存を維持）
// ============================================================================
const CustomModel = ({ id, role, objSize, variant, material, customModelUrl, color, color2, color3, onColorCountDetected, modelDimensions, onModelSizeDetected, fitDimensions = false, natural = false }) => {
  const path = customModelUrl ? customModelUrl : getModelPath(role, variant || 1);
  const { scene } = useGLTF(path);

  const [overrideTexture, setOverrideTexture] = React.useState(null);

  React.useEffect(() => {
    const prefab = SEMANTIC_PREFABS[role];
    if (prefab && material >= 1) {
      const loader = new THREE.TextureLoader();
      const textureUrl = `/${role}/mat_${material}.jpg`;

      loader.load(
        textureUrl,
        (tex) => {
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          tex.repeat.set(1, 1);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.flipY = false;
          setOverrideTexture(tex);
        },
        undefined,
        () => {
          setOverrideTexture(null);
        }
      );
    } else {
      setOverrideTexture(null);
    }
  }, [role, material]);

  const clonedScene = useMemo(() => {
    const clone = scene.clone();
    const colorableMats = [];
    const allMats = new Set();

    clone.traverse((child) => {
      if (child.isMesh && child.material) {
        allMats.add(child.material.name);
        if (child.material.name.includes("Colorable")) {
          if (!colorableMats.includes(child.material.name)) {
            colorableMats.push(child.material.name);
          }
        }
      }
    });
    colorableMats.sort();
    const namedBuilding = supportsBuildingColors({ role, variant, customModelUrl });

    if (onColorCountDetected) {
      let detectedCount = namedBuilding ? 3 : colorableMats.length > 0 ? colorableMats.length : (allMats.size >= 4 ? 4 : 1);
      setTimeout(() => onColorCountDetected(id, detectedCount), 10);
    }

    clone.traverse((child) => {
      if (child.isMesh) {
        if (child.name.includes("Collider_Stairs")) {
          child.visible = false;
        }

        child.material = child.material.clone();
        const matName = child.material.name;

        if (overrideTexture) {
          child.material.map = overrideTexture;
          child.material.needsUpdate = true;
        }

        if (namedBuilding && finishBuildingMaterial(child.material, [color, color2, color3])) {
          child.castShadow = true; child.receiveShadow = true;
        } else if (matName.includes("Colorable")) {
          const idx = colorableMats.indexOf(matName);
          const targetColor = idx === 0 ? color : (idx === 1 ? color2 : color3);

          if (targetColor) {
            child.material.color.set(targetColor);
            child.material.emissive.set(targetColor);
            child.material.emissiveIntensity = targetColor === '#ffffff' ? 0.4 : 0.2;
          }
        } else {
          if (child.material.map) {
            child.material.color.set('#ffffff');
            child.material.emissive.set('#000000');
            child.material.emissiveIntensity = 0;
          } else {
            if (colorableMats.length === 0 && color && allMats.size < 4) {
              child.material.color.set(color);
              child.material.emissive.set(color);
              child.material.emissiveIntensity = color === '#ffffff' ? 0.4 : 0.2;
            }
          }
        }
        child.material.needsUpdate = true;
        if (natural && !customModelUrl) {
          child.castShadow = true; child.receiveShadow = true;
          finishNatureModelMaterial(child.material, role, color, variant, color2);
        }
      }
    });
    finishNativeBuildingFacades(clone, { role, variant, customModelUrl }, [color, color2, color3], { overridden: !!overrideTexture });
    return clone;
  }, [scene, id, color, color2, color3, onColorCountDetected, overrideTexture, natural, customModelUrl, role, variant]);
  React.useEffect(() => () => disposeNativeBuildingFacades(clonedScene), [clonedScene]);

  const nativeSizing = !fitDimensions && (usesNativeSizing(role, variant || 1) || !!customModelUrl);
  const defaultScale = getModelDefault(role, variant || 1)?.scale ?? SEMANTIC_PREFABS[role]?.modelScale ?? 1;
  const bounds = useMemo(() => measureVisibleModel(scene), [scene]);
  React.useEffect(() => {
    if (nativeSizing && bounds && (modelDimensions?.path !== path || (modelDimensions?.defaultScale ?? 1) !== defaultScale)) {
      onModelSizeDetected?.(id, path, bounds.size, defaultScale);
    }
  }, [id, path, bounds, nativeSizing, modelDimensions?.path, modelDimensions?.defaultScale, defaultScale, onModelSizeDetected]);
  const transform = bounds
    ? getNativeModelTransform(objSize, bounds, !nativeSizing || modelDimensions?.path === path)
    : { scale: objSize, position: [0, -objSize[1] / 2, 0] };

  return (
    bounds ? (
      <group scale={transform.scale} position={transform.position}>
        <primitive object={clonedScene} />
      </group>
    ) : (
      <primitive object={clonedScene} scale={transform.scale} position={transform.position} />
    )
  );
};

// ============================================================================
// TiledMaterial：6面独立タイル貼り（ノーマルマップは prefab.useNormalMap で自動分岐）
// ============================================================================
const TiledMaterial = ({ role, material, objSize, color, isSelected }) => {
  const prefab = SEMANTIC_PREFABS[role] || {};
  const matIdx = material || 1;
  const useNormal = !!prefab.useNormalMap;

  const paths = useNormal
    ? [`/${role}/mat_${matIdx}.jpg`, `/${role}/mat_${matIdx}_normal.jpg`]
    : [`/${role}/mat_${matIdx}.jpg`];
  const maps = useTexture(paths);
  const texture = Array.isArray(maps) ? maps[0] : maps;
  const normalMap = Array.isArray(maps) ? (maps[1] || null) : null;

  const textureScale = 5;
  const sx = objSize[0], sy = objSize[1], sz = objSize[2];

  // Box面順: [+X,-X,+Y,-Y,+Z,-Z] → それぞれ (z,y) (x,z) (x,y) のリピート
  const faceDefs = useMemo(() => {
    const make = (src, rx, ry) => {
      const t = src.clone();
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rx / textureScale, ry / textureScale);
      t.needsUpdate = true;
      return t;
    };
    const dims = [[sz, sy], [sx, sz], [sx, sy]];
    return [0, 0, 1, 1, 2, 2].map((d) => ({
      map: make(texture, dims[d][0], dims[d][1]),
      normal: normalMap ? make(normalMap, dims[d][0], dims[d][1]) : undefined,
    }));
  }, [texture, normalMap, sx, sy, sz]);

  return (
    <>
      {faceDefs.map((f, i) => (
        <meshStandardMaterial
          key={i}
          attach={`material-${i}`}
          map={f.map}
          normalMap={f.normal}
          normalScale={normalMap ? new THREE.Vector2(2.0, 2.0) : undefined}
          color={color || '#ffffff'}
          roughness={0.9}
          emissive={isSelected ? '#ffff00' : 'black'}
          emissiveIntensity={isSelected ? 0.4 : 0}
        />
      ))}
    </>
  );
};

// ============================================================================
// 複合ジェネレーター登録制
// ★ 新しい「自動積み上げ系」Roleを追加する時は、関数を書いてここに登録するだけ。
//    GameObject本体のif文には一切触れなくてよい。
// ============================================================================

// --- climb: はしご / らせん階段 / 直線階段の自動ループ ---
const buildClimb = (obj, onColorCountDetected) => {
  const startY = -obj.size[1] / 2;

  if (obj.variant === 2) {
    const partHeight = getModelDefault('climb', 2).size[1];
    const count = Math.max(1, Math.ceil(obj.size[1] / partHeight));

    return (
      <group>
        {Array.from({ length: count }).map((_, i) => (
          <group key={i} position={[0, startY + Math.min(partHeight, obj.size[1] - i * partHeight) / 2 + (i * partHeight), 0]}>
            <CustomModel
              id={`${obj.id}_ladder_${i}`}
              role={obj.role}
              objSize={[obj.size[0], Math.min(partHeight, obj.size[1] - i * partHeight), obj.size[2]]}
              fitDimensions
              variant={obj.variant}
              material={obj.material}
              color={obj.color}
              color2={obj.color2}
              color3={obj.color3}
              onColorCountDetected={onColorCountDetected}
            />
          </group>
        ))}
      </group>
    );
 } else if (obj.variant === 1) { // 直線階段
    // ==========================================
    // ★ 理想の直方体ブロックを作る設定 ★
    // ==========================================
    const { count, stepHeight, stepDepth } = getStairLayout(obj.size);

    // Fill each tread down to the stair base, so ascending steps form a solid flight.
    const blockHeight = stepHeight; 
    const blockDepth = stepDepth; 

    const startZ = -obj.size[2] / 2;

    return (
      <group>
        {Array.from({ length: count }).map((_, i) => (
          <mesh 
            key={i} 
            castShadow
            receiveShadow
            position={[
              0, 
              startY + (blockHeight * (i + 1) / 2),
              startZ + (blockDepth / 2) + (i * stepDepth)
            ]}
          >
            {/* ★ 謎の圧縮を起こすCustomModelをやめ、純粋な直方体(Box)を生成！ */}
            {obj.spatialAppearance ? <SpatialBoxGeometry size={[obj.size[0], blockHeight * (i + 1), blockDepth]} /> : <boxGeometry args={[obj.size[0], blockHeight * (i + 1), blockDepth]} />}

            {/* ★ CustomModelがやっていた「テクスチャや色の反映」をここでやってあげる */}
            {obj.spatialAppearance ? <SpatialMaterial obj={obj} /> : SEMANTIC_PREFABS[obj.role]?.tiled ? (
              <TiledMaterial
                role={obj.role}
                material={obj.material}
                objSize={[obj.size[0], blockHeight * (i + 1), blockDepth]}
                color={obj.color}
                isSelected={false}
              />
            ) : (
              <meshStandardMaterial
                color={obj.color || SEMANTIC_PREFABS[obj.role]?.color || 'gray'}
                roughness={0.7}
              />
            )}
          </mesh>
        ))}
      </group>
    );
  }
};

// --- tower: タワー本体＋内部はしご自動生成 ---
const buildTower = (obj, onColorCountDetected, onModelSizeDetected) => {
  const LADDER_NATIVE_HEIGHT = getModelDefault('climb', 2).size[1];
  const actualTowerHeight = obj.size[1];
  const ladderCount = Math.max(1, Math.ceil(actualTowerHeight / LADDER_NATIVE_HEIGHT));
  const startY = -obj.size[1] / 2;
  const LADDER_OFFSET_Z = 0.5;

  return (
    <group>
      <Suspense fallback={<boxGeometry args={obj.size} />}>
        <CustomModel
          id={obj.id}
          role={obj.role}
          objSize={obj.size}
          variant={obj.variant}
          material={obj.material}
          customModelUrl={obj.customModelUrl}
          color={obj.color}
          color2={obj.color2}
          color3={obj.color3}
          onColorCountDetected={onColorCountDetected}
          modelDimensions={obj.modelDimensions}
          onModelSizeDetected={onModelSizeDetected}
        />
      </Suspense>

      {(obj.variant === 2 || obj.variant === 3) && Array.from({ length: ladderCount }).map((_, i) => (
        <group
          key={`internal_ladder_${i}`}
          position={[0, startY + Math.min(LADDER_NATIVE_HEIGHT, actualTowerHeight - i * LADDER_NATIVE_HEIGHT) / 2 + (i * LADDER_NATIVE_HEIGHT), LADDER_OFFSET_Z]}
        >
          <Suspense fallback={null}>
            <CustomModel
              id={`${obj.id}_internal_ladder_${i}`}
              role="climb"
              variant={2}
              objSize={[getModelDefault('climb', 2).size[0], Math.min(LADDER_NATIVE_HEIGHT, actualTowerHeight - i * LADDER_NATIVE_HEIGHT), getModelDefault('climb', 2).size[2]]}
              fitDimensions
              material={1}
              color={obj.color}
              color2={obj.color2}
              color3={obj.color3}
            />
          </Suspense>
        </group>
      ))}
    </group>
  );
};

// --- barrier: 柵の横方向自動ループ（モデルの反復配置） ---
const buildBarrier = (obj, onColorCountDetected, _size, natural) => {
  // これから作る variant: 2（カスタム柵モデル）の時だけ反復させる
  if (obj.variant === 2) {
    // ==========================================
    // 💡 Blenderで作る柵1つ分の基準幅（Xサイズ）
    // モデル完成後に、ここの数字を実際のモデルの幅に合わせて調整してください
    // ==========================================
    const partWidth = getModelDefault('barrier', 2).size[0];

    // エディタで指定された横幅(size[0])に、柵がいくつ入るか計算
    const count = Math.max(1, Math.round(obj.size[0] / partWidth));
    
    // 隙間なくピッタリ端から端まで埋めるために、1つあたりの実際の幅を微調整
    const actualWidth = obj.size[0] / count;
    
    // バリア全体の左端のX座標スタート位置
    const startX = -obj.size[0] / 2;

    return (
      <group>
        {Array.from({ length: count }).map((_, i) => (
          <group 
            key={`barrier_part_${i}`} 
            // 左端から順番に、actualWidthずつズラして配置していく
            position={[startX + (actualWidth / 2) + (i * actualWidth), 0, 0]}
          >
            <Suspense fallback={null}>
              <CustomModel
                id={`${obj.id}_part_${i}`}
                role={obj.role}
                // ★超重要：横幅(X)は分割したサイズを渡し、高さ(Y)と厚み(Z)はエディタの指定をそのまま渡す
                objSize={[actualWidth, obj.size[1], obj.size[2]]}
                variant={obj.variant}
                natural={natural}
                material={obj.material}
                color={obj.color}
                color2={obj.color2}
                color3={obj.color3}
                // カラー検出は最初の1個目だけでOK（重複処理を防ぐ）
                onColorCountDetected={i === 0 ? onColorCountDetected : undefined}
              />
            </Suspense>
          </group>
        ))}
      </group>
    );
  }
  // variant 2 以外の場合は何も返さず、通常の「1つのモデルを伸ばす」処理に任せる
  return null;
};

// ★ 複合レンダラーのレジストリ（新規複合Roleはここに1行登録）
function Landform({ obj, natural, bridges }) {
  const topKind = obj.terrainProfile?.rockMass ? 'granite' : obj.terrainProfile?.surfaceMaterial || 'grass';
  const textured = natural || !!obj.terrainProfile?.surfaceMaterial;
  const sideKind = obj.terrainProfile?.rockMass ? 'granite' : obj.terrainProfile?.sideMaterial || 'rock';
  const paintedSides = sideKind === 'masonry';
  const painted = natural || paintedSides || obj.terrainProfile?.surfaceBlend === 'slope' || obj.terrainProfile?.rockStrata;
  const normalScale = obj.terrainProfile?.rockMass ? [0.12, 0.12] : [1, 1];
  const grass = useNatureTexture(topKind), rock = useNatureTexture(sideKind);
  const grassNormal = useNatureTexture(topKind, true), rockNormal = useNatureTexture(sideKind, true);
  const geometry = useMemo(() => {
    if (!obj.terrainProfile) {
      const box = new THREE.BoxGeometry(...obj.size);
      for (const group of box.groups) group.materialIndex = group.materialIndex === 2 ? 0 : 1;
      return box;
    }
    const data = terrainMeshData(obj);
    const mesh = new THREE.BufferGeometry();
    mesh.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    mesh.setAttribute('uv', new THREE.Float32BufferAttribute(terrainSurfaceUVs(data, obj), 2));
    if (painted) mesh.setAttribute('color', new THREE.Float32BufferAttribute(obj.terrainProfile?.rockStrata ? rockStrataColors(data, obj) : paintedSides ? terrainMasonryColors(data, obj) : terrainSurfaceColors(data, obj, bridges), 3));
    mesh.setIndex(data.indices);
    mesh.addGroup(0, data.topIndexCount, 0);
    mesh.addGroup(data.topIndexCount, data.indices.length - data.topIndexCount, 1);
    mesh.computeVertexNormals();
    return finishRockStrataGeometry(mesh, obj);
  }, [obj, bridges, paintedSides, painted]);
  React.useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} castShadow receiveShadow>
    <meshStandardMaterial key={painted ? 'painted-0' : 'plain-0'} attach="material-0" vertexColors={painted && !!obj.terrainProfile} map={textured ? grass : null} normalMap={textured ? grassNormal : null} normalScale={normalScale} color={painted && obj.terrainProfile ? '#ffffff' : obj.color || SEMANTIC_PREFABS.landform.color} roughness={0.96} />
    <meshStandardMaterial key={painted ? 'painted-1' : 'plain-1'} attach="material-1" vertexColors={painted && !!obj.terrainProfile} map={textured ? rock : null} normalMap={textured ? rockNormal : null} normalScale={normalScale} color={painted && obj.terrainProfile ? '#ffffff' : obj.color2 || '#74797e'} roughness={0.94} />
  </mesh>;
}

const COMPOSITE_RENDERERS = {
  water: obj => <River obj={obj} />,
  landform: (obj, _color, _size, natural, bridges) => <Landform obj={obj} natural={natural} bridges={bridges} />,
  corridor: (obj, _color, _size, natural) => natural ? <NaturePaving obj={obj} /> : null,
  bridge: (obj, _color, _size, natural) => natural ? <NaturePaving obj={obj} kind="wood" /> : null,
  climb: buildClimb,
  tower: buildTower,
  barrier: buildBarrier,
};

function River({ obj }) {
  const normal = useNatureTexture('water', true);
  const geometry = useMemo(() => {
    if (!obj.riverProfile) return new THREE.BoxGeometry(...obj.size);
    const data = riverMeshData(obj), mesh = new THREE.BufferGeometry();
    mesh.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    mesh.setAttribute('uv', new THREE.Float32BufferAttribute(planarUVs(data.positions, 4), 2));
    mesh.setAttribute('color', new THREE.Float32BufferAttribute(riverSurfaceColors(data, obj), 3));
    mesh.setIndex(data.indices); mesh.computeVertexNormals(); return mesh;
  }, [obj]);
  React.useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} receiveShadow><meshStandardMaterial vertexColors={!!obj.riverProfile} color={obj.riverProfile ? '#ffffff' : obj.color || SEMANTIC_PREFABS.water.color} normalMap={obj.riverProfile ? normal : null} transparent opacity={obj.riverProfile ? 0.86 : 0.4} metalness={obj.riverProfile ? 0.08 : 0} roughness={obj.riverProfile ? 0.26 : 0.35} /></mesh>;
}

// ============================================================================
// GameObject 本体
// ============================================================================
function GameObject({ obj, transformType, selectedIds, onSelect, onTransformEnd, setOrbitEnabled, onColorCountDetected, onModelSizeDetected, natural = false, bridges, hoverEnabled = true }) {
  const isSelected = selectedIds.includes(obj.id);
  const isActive = selectedIds[selectedIds.length - 1] === obj.id;
  const prefab = SEMANTIC_PREFABS[obj.role] || {};

  const meshRef = useRef();

  const SplineTube = ({ points, color }) => {
    const pointsStr = JSON.stringify(points);
    const curve = useMemo(() => {
      const parsedPoints = JSON.parse(pointsStr);
      const vPoints = parsedPoints.map(p => new THREE.Vector3(p[0], p[1], p[2]));
      return new THREE.CatmullRomCurve3(vPoints);
    }, [pointsStr]);

    return (
      <mesh
        name={`[${obj.role}]_${obj.name}`}
        onClick={(e) => {
          if (e.delta > 2 || window.isDraggingGizmo) return;
          e.stopPropagation();
          onSelect(obj.id, e.shiftKey);
        }}
      >
        <tubeGeometry args={[curve, 64, 2, 8, false]} />
        <meshStandardMaterial color={color} roughness={0.7} emissive={isSelected ? "#ffff00" : "black"} emissiveIntensity={isSelected ? 0.4 : 0} />
      </mesh>
    );
  };

  if (obj.type === 'spline') {
    return <group><SplineTube points={obj.points} color={obj.color} /></group>;
  }

  const renderGeometry = () => {
    if (obj.spatialAppearance && obj.type === 'box' && obj.role !== 'climb' && !obj.customModelUrl) {
      const palette = TERRAIN_DISTRICTS[obj.spatialAppearance.district];
      return <SpatialBoxGeometry size={obj.size} untiled={!!spatialLabelKind(obj)} labelTopOnly={spatialLabelKind(obj) === 'floor'} wallColors={hasSpatialWallCourses(obj) ? [obj.color, palette.crown, palette.foot].join(',') : null} railColors={isSpatialRailing(obj) ? [obj.color, palette.crown, palette.foot].join(',') : null} railAxis={obj.spatialAppearance.railingAxis} wallPanels={hasSpatialWallPanels(obj)} mutedPosts={hasMutedRailingPosts(obj)} />;
    }
    // ★ 1. 複合ジェネレーター登録制（if文の連鎖を廃止）
    const composite = COMPOSITE_RENDERERS[obj.role];
    if (composite && !obj.customModelUrl) {
      const result = composite(obj, onColorCountDetected, onModelSizeDetected, natural, bridges);
      if (result) return result; // ★ こう書き換える！
    }

    // ★ 2. モデル所持判定はprefabフラグで（hasDefaultModel配列を廃止）
    if (prefab.hasModel || obj.customModelUrl) {
      return (
        <Suspense fallback={<boxGeometry args={obj.size} />}>
          <CustomModel
            id={obj.id}
            role={obj.role}
            objSize={obj.size}
            variant={obj.variant}
            material={obj.material}
            customModelUrl={obj.customModelUrl}
            natural={natural}
            color={obj.color}
            color2={obj.color2}
            color3={obj.color3}
            onColorCountDetected={onColorCountDetected}
            modelDimensions={obj.modelDimensions}
            onModelSizeDetected={onModelSizeDetected}
          />
        </Suspense>
      );
    }

    if (obj.type === 'sphere') return <sphereGeometry args={[obj.size[0] / 2, 32, 32]} />;
    if (obj.type === 'cylinder') return <cylinderGeometry args={[obj.size[0] / 2, obj.size[0] / 2, obj.size[1], 32]} />;
    if (obj.type === 'cone') return <coneGeometry args={[obj.size[0] / 2, obj.size[1], 32]} />;
    if (obj.type === 'triangle') return <cylinderGeometry args={[obj.size[0] / 2, obj.size[0] / 2, obj.size[1], 3]} />;
    if (obj.type === 'pentagon') return <cylinderGeometry args={[obj.size[0] / 2, obj.size[0] / 2, obj.size[1], 5]} />;
    if (obj.type === 'hexagon')  return <cylinderGeometry args={[obj.size[0] / 2, obj.size[0] / 2, obj.size[1], 6]} />;
    return <boxGeometry args={obj.size} />;
  };

  return (
    <group>
      <mesh
        ref={meshRef}
        name={`[${obj.role}]_${obj.name}`}
        castShadow
        receiveShadow
        position={obj.pos}
        rotation={obj.rot || [0, 0, 0]}
        onClick={(e) => {
          if (e.delta > 2 || window.isDraggingGizmo) return;
          e.stopPropagation();
          onSelect(obj.id, e.shiftKey);
        }}
        onPointerOver={hoverEnabled ? (e) => {
          if (window.isDraggingGizmo) return;
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        } : undefined}
        onPointerOut={hoverEnabled ? (e) => {
          e.stopPropagation();
          document.body.style.cursor = 'auto';
        } : undefined}
      >
        {renderGeometry()}

        {/* ★ タイル材質・半透明の判定もすべてprefabフラグ駆動 */}
        {obj.spatialAppearance ? <SpatialMaterial obj={obj} selected={isSelected} /> : prefab.tiled ? (
          <Suspense fallback={<meshStandardMaterial color={obj.color || 'gray'} />}>
            <TiledMaterial
              role={obj.role}
              variant={obj.variant}
              material={obj.material}
              objSize={obj.size}
              color={obj.color}
              isSelected={isSelected}
            />
          </Suspense>
        ) : (
          <meshStandardMaterial
            color={obj.color || prefab.color || 'gray'}
            roughness={0.7}
            emissive={isSelected ? "#ffff00" : "black"}
            emissiveIntensity={isSelected ? 0.4 : 0}
            transparent={prefab.opacity !== undefined}
            opacity={prefab.opacity ?? 1}
          />
        )}
      </mesh>

      {isActive && (
        <TransformControls
          object={meshRef}
          mode={transformType}
          translationSnap={0.5}
          rotationSnap={Math.PI / 8}
          onMouseDown={() => {
            setOrbitEnabled(false);
            window.isDraggingGizmo = true;
          }}
          onMouseUp={() => {
            setOrbitEnabled(true);
            setTimeout(() => { window.isDraggingGizmo = false; }, 100);

            if (meshRef.current) {
              const p = meshRef.current.position;
              const r = meshRef.current.rotation;
              const s = meshRef.current.scale;
              const newSize = [
                clamp(obj.size[0] * s.x, 0.1, 200),
                clamp(obj.size[1] * s.y, 0.1, 50),
                clamp(obj.size[2] * s.z, 0.1, 200)
              ];
              meshRef.current.scale.set(1, 1, 1);
              onTransformEnd(obj.id, {
                pos: [parseFloat(p.x.toFixed(2)), parseFloat(p.y.toFixed(2)), parseFloat(p.z.toFixed(2))],
                rot: [parseFloat(r.x.toFixed(2)), parseFloat(r.y.toFixed(2)), parseFloat(r.z.toFixed(2))],
                size: newSize
              });
            }
          }}
        />
      )}
    </group>
  );
}

// ============================================================================
// ★ React.memo で不要な再描画を遮断
// 選択変更時に「選択状態が変わらない他の全オブジェクト」の再レンダーを防ぐ。
// （関数propsは比較対象から除外：内部でRef経由の最新データを参照するため安全）
// ============================================================================
const isSel = (ids, id) => ids.includes(id);
const isAct = (ids, id) => ids[ids.length - 1] === id;

function areEqual(prev, next) {
  return (
    prev.obj === next.obj &&
    prev.editorMode === next.editorMode &&
    prev.transformType === next.transformType &&
    prev.hoverEnabled === next.hoverEnabled &&
    isSel(prev.selectedIds, prev.obj.id) === isSel(next.selectedIds, next.obj.id) &&
    isAct(prev.selectedIds, prev.obj.id) === isAct(next.selectedIds, next.obj.id)
  );
}

export default React.memo(GameObject, areEqual);

// useGLTF loads and caches each model when the scene actually uses it. Eagerly
// loading the entire catalog downloads unrelated models on public web visits.

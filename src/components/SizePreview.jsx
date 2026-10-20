import React, { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import { MODEL_PREVIEW_ENTRIES, createSizePreviewObject, getModelDefault } from '../core/modelCatalog';
import { CHARACTER_HEIGHT, PLAYER_EYE_HEIGHT } from '../core/worldScale';
import { applyNativeModelSize } from '../core/modelSizing';
import ASSET_CATALOG from '../data/asset_catalog.json';
import GameObject from './GameObject';
import ReferenceCharacter from './ReferenceCharacter';

const noop = () => {};
const emptySelection = [];
const labels = role => ASSET_CATALOG[role]?.display_name_ja || role;

function PreviewView({ size, view, reset }) {
  const { camera } = useThree();
  const controls = useRef();
  const [width, height, depth] = size;
  useEffect(() => {
    if (!controls.current) return;
    const targetY = view === 'eye' ? PLAYER_EYE_HEIGHT : Math.max(height, CHARACTER_HEIGHT) / 2;
    const distance = view === 'eye'
      ? depth / 2 + Math.max(3, width * 0.9)
      : depth / 2 + Math.max(height, width + 3, 5) * 1.5;
    camera.position.set(view === 'side' ? distance : 0, view === 'eye' ? PLAYER_EYE_HEIGHT : targetY + height * 0.12, view === 'side' ? 0 : distance);
    controls.current.target.set(0, targetY, 0);
    controls.current.update();
  }, [camera, width, height, depth, view, reset]);
  return <OrbitControls ref={controls} makeDefault minDistance={0.2} />;
}

class PreviewError extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <p role="alert">モデルを読み込めませんでした。別のモデルを選んでください。</p> : this.props.children;
  }
}

function PreviewModel({ entry }) {
  const [obj, setObj] = useState(() => createSizePreviewObject(entry.role, entry.variant));
  const [ratio, setRatio] = useState(1);
  const [view, setView] = useState('front');
  const [reset, setReset] = useState(0);
  const original = createSizePreviewObject(entry.role, entry.variant);
  const model = getModelDefault(entry.role, entry.variant);
  const adjust = value => {
    const factor = Math.min(5, Math.max(0.1, Number(value) || 1));
    setRatio(factor);
    setObj({ ...original, size: original.size.map(v => v * factor), pos: [0, original.size[1] * factor / 2, 0] });
  };
  const personX = view === 'side' ? obj.size[0] / 2 : -obj.size[0] / 2 - 1.2;
  const personZ = obj.size[2] / 2 + (view === 'side' ? 1.2 : 0);
  return <>
    <div className="size-preview-tools">
      <span>人型：{CHARACTER_HEIGHT}m ／ 目線：{PLAYER_EYE_HEIGHT}m</span>
      <div>
        <button className={`tbtn ${view === 'front' ? 'on' : ''}`} onClick={() => { setView('front'); setReset(v => v + 1); }}>正面</button>
        <button className={`tbtn ${view === 'side' ? 'on' : ''}`} onClick={() => { setView('side'); setReset(v => v + 1); }}>横から</button>
        <button className={`tbtn ${view === 'eye' ? 'on' : ''}`} onClick={() => { setView('eye'); setReset(v => v + 1); }}>人の目線</button>
      </div>
    </div>
    <div className="size-preview-canvas">
      <PreviewError key={entry.key}>
        <Canvas camera={{ position: [0, 5, 12], fov: 50, near: 0.01, far: 2000 }}>
          <color attach="background" args={['#303946']} />
          <ambientLight intensity={1.5} />
          <directionalLight position={[8, 20, 10]} intensity={2} />
          <Suspense fallback={null}>
            <GameObject obj={obj} selectedIds={emptySelection} onSelect={noop} onTransformEnd={noop} setOrbitEnabled={noop}
              onModelSizeDetected={(id, path, size, scale) => setObj(current => applyNativeModelSize(current, path, size, scale))} />
            <group position={[personX, 0, personZ]}><ReferenceCharacter /></group>
          </Suspense>
          <mesh position={[0, -0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1000, 1000]} /><meshStandardMaterial color="#606b72" />
          </mesh>
          <Grid position={[0, 0, 0]} args={[200, 200]} cellSize={1} sectionSize={5} cellColor="#9ba5af" sectionColor="#c8d3dd" fadeDistance={150} />
          <PreviewView size={obj.size} view={view} reset={reset} />
        </Canvas>
      </PreviewError>
    </div>
    <div className="size-preview-details">
      <p><strong>表示寸法：</strong>幅 {obj.size[0].toFixed(3)}m ／ 高さ {obj.size[1].toFixed(3)}m ／ 奥行き {obj.size[2].toFixed(3)}m</p>
      <p>元モデル：{model.bounds.size.map(v => `${v.toFixed(3)}m`).join(' × ')}（幅・高さ・奥行き）</p>
      {model.note && <p>{model.note}</p>}
      <label>比較用の倍率 <input aria-label="比較用の倍率" type="number" min="0.1" max="5" step="0.1" value={ratio} onChange={e => adjust(e.target.value)} /></label>
      <button className="tbtn" onClick={() => { adjust(1); setReset(v => v + 1); }}>基準サイズに戻す</button>
      <p>倍率変更はこの確認画面だけに反映されます。気になるモデル名・番号・倍率を教えていただければ、基準サイズに反映できます。</p>
      {['climb', 'barrier'].includes(entry.role) && <p>階段・はしご・柵は、実際の配置処理で組み立てた形を表示しています。</p>}
    </div>
  </>;
}

export default function SizePreview({ onClose }) {
  const [index, setIndex] = useState(0);
  const entry = MODEL_PREVIEW_ENTRIES[index];
  useEffect(() => {
    const closeOnEscape = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  return <div className="size-preview-overlay">
    <section className="size-preview-dialog" role="dialog" aria-modal="true" aria-label="モデルのサイズ確認">
      <header><div><h2>モデルのサイズ確認</h2><p>同じ人型・地面と比較できます。モデルを切り替えると基準サイズに戻ります。</p></div><button className="tbtn" autoFocus onClick={onClose}>閉じる</button></header>
      <div className="size-preview-selector">
        <button className="tbtn" disabled={index === 0} onClick={() => setIndex(v => v - 1)}>← 前</button>
        <select aria-label="確認するモデル" value={index} onChange={e => setIndex(Number(e.target.value))}>
          {MODEL_PREVIEW_ENTRIES.map((item, i) => <option key={item.key} value={i}>{labels(item.role)}（{item.role}）／ {item.variant}</option>)}
        </select>
        <button className="tbtn" disabled={index === MODEL_PREVIEW_ENTRIES.length - 1} onClick={() => setIndex(v => v + 1)}>次 →</button>
        <span>{index + 1} / {MODEL_PREVIEW_ENTRIES.length}</span>
      </div>
      <PreviewModel key={entry.key} entry={entry} />
    </section>
  </div>;
}

import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { summarizeFrames } from '../core/renderQuality';

export function RenderPerformanceSampler({ statsRef }) {
  const { gl } = useThree();
  const samples = useRef([]);
  const previous = useRef(null);
  const started = useRef(null);
  useEffect(() => {
    const reset = () => { samples.current = []; previous.current = null; started.current = null; statsRef.current = null; };
    document.addEventListener('visibilitychange', reset);
    return () => { document.removeEventListener('visibilitychange', reset); statsRef.current = null; };
  }, [statsRef]);
  useFrame(() => {
    if (document.hidden) return;
    const now = performance.now();
    if (previous.current !== null) samples.current.push(now - previous.current);
    previous.current = now;
    started.current ??= now;
    if (now - started.current < 2000) return;
    statsRef.current = { ...summarizeFrames(samples.current), calls: gl.info.render.calls, triangles: gl.info.render.triangles,
      pixelRatio: Math.round(gl.getPixelRatio() * 100) / 100 };
    samples.current = [];
    started.current = now;
  });
  return null;
}

export function RenderPerformanceReadout({ statsRef }) {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    const timer = setInterval(() => setStats(statsRef.current), 1000);
    return () => clearInterval(timer);
  }, [statsRef]);
  return <div className="render-performance" aria-label="表示速度の計測結果">
    {stats ? <>
      <strong>{stats.fps} FPS</strong><span>遅いフレームの目安：{stats.p95} ms</span>
      <span>30 FPS相当を下回る間隔：{stats.slowPercent}%</span>
      <details><summary>描画の詳細</summary><span>前フレームの描画回数：{stats.calls}</span><span>三角形：{stats.triangles.toLocaleString()}</span><span>描画倍率：{stats.pixelRatio}</span></details>
    </> : <span>計測中… 約2秒お待ちください</span>}
    <small>同じ視点・同じ操作で比較してください。処理の原因を特定する数値ではありません。</small>
  </div>;
}

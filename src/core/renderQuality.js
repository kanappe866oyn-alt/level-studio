export const RENDER_QUALITY = {
  light: { label: '軽量', dpr: [1, 1], shadows: false, shadowSize: 512, description: '影を省き、表示解像度を抑えます。' },
  standard: { label: '標準', dpr: [1, 1.25], shadows: true, shadowSize: 1024, description: '影と表示の細かさを控えめにします。' },
  high: { label: '高品質', dpr: [1, 2], shadows: true, shadowSize: 2048, description: '細かな表示と影を優先します。' },
};

// Frame spacing measures responsiveness, not GPU execution time.
export function summarizeFrames(intervals) {
  const values = intervals.filter(v => Number.isFinite(v) && v > 0);
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    fps: Math.round(1000 * values.length / values.reduce((sum, v) => sum + v, 0)),
    p95: Math.round(sorted[Math.ceil(sorted.length * 0.95) - 1] * 10) / 10,
    slowPercent: Math.round(values.filter(v => v > 1000 / 30).length / values.length * 100),
  };
}

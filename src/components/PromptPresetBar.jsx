// src/components/PromptPresetBar.jsx
import React from 'react';

const MODE_PRESETS = {
  free: [
    "夕暮れの海辺に木と岩を配置して",
    "春らしい公園風の空間を作って",
    "階段で2階の回廊へ登れる展示空間を作って"
  ],
  combat: [
    "中央で撃ち合いが起きやすい市街地アリーナ",
    "遮蔽物が多く、近中距離戦が熱いアリーナ",
    "高所は強いが独占できないバランスにして"
  ],
  platforming: [
    "足場を乗り継いで高所のゴールを目指すコース",
    "溶岩の上を橋と階段で渡り、高所へ登れるステージ",
    "踊り場とチェックポイント付きの階段で登るタワー"
  ]
};

export default function PromptPresetBar({ generationMode, onApplyPreset }) {
  const presets = MODE_PRESETS[generationMode] || MODE_PRESETS.free;

  return (
    <div className="preset-wrap">
      <div className="preset-title">⚡ クイックプリセット</div>
      <div className="preset-list">
        {presets.map((preset, i) => (
          <button
            key={i}
            className="preset-chip"
            onClick={() => onApplyPreset(preset)}
            type="button"
          >
            {preset}
          </button>
        ))}
      </div>
    </div>
  );
}

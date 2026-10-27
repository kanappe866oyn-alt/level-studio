// src/core/assetPrompt.js
import ASSET_CATALOG from '../data/asset_catalog.json' with { type: 'json' };
import { getModelDefault, usesNativeSizing } from './modelCatalog.js';
import ASSETS from '../assets.json' with { type: 'json' };

export function buildAssetKnowledgeText(roles = [], { compact = false } = {}) {
  const lines = [];

  roles.forEach((role) => {
    const item = ASSET_CATALOG[role];
    if (!item) return;

    if (compact) {
      const prefab = ASSETS.SEMANTIC_PREFABS[role];
      lines.push(`- ${role}: ${item.display_name_ja || ''}。${item.shape_tags?.join(' / ') || ''}。`);
      for (let variant = 1; variant <= (prefab?.variants || 1); variant++) {
        const model = getModelDefault(role, variant);
        if (model) lines.push(`  variant=${variant}, 実寸[${model.size.map(v=>v.toFixed(2)).join(',')}]m（${usesNativeSizing(role,variant)?'寸法固定':'サイズ変更可'}）`);
      }
      if (prefab?.hasModel) lines.push('  material=0で元の材質。posは実寸の中心。');
      return;
    }

    lines.push(`- role: ${role}`);
    if (item.display_name_ja) lines.push(`  日本語名: ${item.display_name_ja}`);
    if (item.semantic_category) lines.push(`  カテゴリ: ${item.semantic_category}`);
    if (item.shape_tags?.length) lines.push(`  形状特性: ${item.shape_tags.join(' / ')}`);
    if (item.material_tags?.length) lines.push(`  材質特性: ${item.material_tags.join(' / ')}`);
    if (item.style_tags?.length) lines.push(`  世界観タグ: ${item.style_tags.join(' / ')}`);
    if (item.placement_tags?.length) lines.push(`  自然な配置: ${item.placement_tags.join(' / ')}`);
    if (item.gameplay_tags?.length) lines.push(`  ゲームプレイ効果: ${item.gameplay_tags.join(' / ')}`);
    
    // ★ 追加：オブジェクト間の関係性（Relationship）をAIに注入
    if (item.relationships) {
      const rels = [];
      if (item.relationships.connects?.length) rels.push(`繋ぐ対象:[${item.relationships.connects.join(', ')}]`);
      if (item.relationships.spans?.length) rels.push(`跨ぐ対象:[${item.relationships.spans.join(', ')}]`);
      if (item.relationships.unlocks?.length) rels.push(`解錠対象:[${item.relationships.unlocks.join(', ')}]`);
      if (item.relationships.activates?.length) rels.push(`起動対象:[${item.relationships.activates.join(', ')}]`);
      if (item.relationships.attachedTo?.length) rels.push(`付着対象:[${item.relationships.attachedTo.join(', ')}]`);
      if (rels.length > 0) lines.push(`  関係性: ${rels.join(' / ')}`);
    }

    if (item.scale_hint) lines.push(`  スケール目安: ${item.scale_hint}`);
    const prefab = ASSETS.SEMANTIC_PREFABS[role];
    for (let variant = 1; variant <= (prefab?.variants || 1); variant++) {
      const model = getModelDefault(role, variant);
      if (model) {
        lines.push(`  variant ${variant}の基準寸法（幅・高さ・奥行き、m）: [${model.size.map(v => v.toFixed(3)).join(', ')}]。${usesNativeSizing(role, variant) ? 'この寸法を使って間隔と接地位置を計算する。' : 'この寸法を基準に、配置目的に必要な幅・高さ・奥行きを指定する。'}`);
        if (model.note) lines.push(`  variant ${variant}の用途: ${model.note}`);
      }
    }
    if (item.preferred_colors?.length) lines.push(`  推奨色: ${item.preferred_colors.join(', ')}`);
    if (item.negative_rules?.length) lines.push(`  禁止傾向: ${item.negative_rules.join(' / ')}`);
  });

  return lines.join('\n');
}

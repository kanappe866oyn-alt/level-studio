import { buildNature } from './natureGenerator.js';
import { generatePlannedStage } from './plannedGeneration.js';
import { natureBriefPrompt, validateNatureBrief, natureRequirementIssues, natureBriefReport } from './natureRequestBrief.js';

export function naturePlanningPrompt(prompt, theme) {
  return `あなたは自然ステージの設計担当です。ユーザーの指示: ${prompt}\nテーマ: ${theme}\n参考画像があれば地形の段差、水辺、岩、植生、景観の構成を読み取ってください。
自然地形の設計JSONのみを出力してください。座標はプログラムで計算します。
幅・奥行48〜80m、中央に幅4〜10mの川または乾いた渓谷。両岸に高さ1〜3mずつ上昇する3段の地形を設け、階段4本と橋2本で周回させます。
terraceLayoutはbalanced（均等）、lower-wide（低地を広く）、middle-wide（中段を広く）、upper-wide（高台を広く）から選びます。入口の活動空間を広くするならlower-wide、休憩や寄り道を重視するならmiddle-wide、展望地点を広くするならupper-wideです。段の奥行と階段・橋の位置はこの指定から計算します。各段に最低12mを確保するため、狭いステージでは変化量が小さくなります。
riverBendは流路の曲がり幅0〜3m。直線の指定では0にします。川と岸辺は同じ曲線になり、狭い地形では通路や植生を守るため曲がり幅を制限します。
backdropEnabledをtrueにすると主要地形の奥に18mの土台と岩壁3つを追加し、景観を囲みます。岩壁も編集・保存・出力する実物です。width/depthは主要地形の広さで、岩壁込みの全体の奥行はdepth+18mです。岩壁へ登る道は作りません。開けた景観を指定された場合はfalseにします。
terrainSeedは形を再現する0〜65535の整数。reliefは地表の起伏0〜1.2m、edgeRoughnessは崖の輪郭変化0〜0.12。平坦な指定ではreliefを0にします。階段と橋の接続部はプログラムが平坦に保ちます。
地形の外縁は段・岸・seedに応じて広い部分と絞った部分を作り、川の曲がりの方向と強さも段ごとに変えます。edgeRoughnessが0なら外縁の絞り込みも0になります。接続部を保つため、地形全体の骨格は両岸3段です。
自由制作では低地の岸辺に岩、中段に木立、高台に岩群と開けた展望空間を作ります。densityは植生と岩群の密度であり、sparseは余白を広く、denseは群れを増やします。地形と装飾の形・大きさ・向きの変化はterrainSeedから再現でき、狭い地形や急な起伏では安全を優先して配置を減らします。
自由制作ではスタートに石柱のある入口広場、中段の両岸に腰掛け付き休憩広場、ゴールに対岸から見える塔を添えた展望広場を設けます。広場と小道は歩ける床で、目印は経路の脇に置きます。塔の内部への立ち入りや腰掛けに座る操作は対象外です。
自由制作の橋は木の板と高さ1.1mの欄干を備え、橋の両端は開けます。展望広場の石の縁取りは低く、中央の道と塔へ向かう側の隙間を確保します。
ジャンプ、泳ぎ、大規模な山、洞窟、滝の動作、任意の分岐や手描きの川の形状は対象外。intentに採用した要素と再現できない要求を日本語で説明してください。`;
}
export async function generatePlannedNature(options) {
  let brief = null;
  if (options.requestBrief) {
    options.signal.throwIfAborted();
    options.onStatus?.('AIが参考画像と指示の特徴を整理しています。');
    const context = { request: options.userPrompt || '', theme: options.theme || '', hasImage: !!options.hasReferenceImage };
    const response = await options.requestBrief(natureBriefPrompt(context.request, context.theme, context.hasImage));
    options.signal.throwIfAborted();
    brief = validateNatureBrief(response, context);
  }
  return generatePlannedStage({ ...options,
    prompt: options.prompt + (brief ? `\n【先に整理した特徴と条件】\n${JSON.stringify(brief)}\nrequirementsの値を必ず守り、preferencesは必須条件と矛盾しない範囲で参考にしてください。unsupportedは再現できたと説明しないでください。` : ''),
    buildStage: (plan, mode) => {
      if (brief) {
        const issues = natureRequirementIssues(plan, brief);
        if (issues.length) throw new Error(issues.join('\n'));
      }
      const stage = buildNature(plan, mode);
      if (brief) stage.design_rationale.reference_alignment = natureBriefReport(stage.plan, brief);
      return stage;
    }, label: '自然地形', assemblyMessage: '読み取った条件・地形・歩行経路を検証しています。' });
}

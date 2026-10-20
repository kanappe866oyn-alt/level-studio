import { buildCity } from './cityGenerator.js';
import { generatePlannedStage } from './plannedGeneration.js';

export function cityPlanningPrompt(prompt, theme) {
  return `あなたは都市ステージの設計担当です。ユーザーの指示: ${prompt}\nテーマ: ${theme}\n参考画像があれば、街区の用途、広さ、密度、色、高低差の意図を読み取ってください。\n出力は都市設計のJSONのみ。個別オブジェクトの座標はプログラムで計算します。\n4街区は北西・北東・南西・南東の順。中央に十字の大通り、北側に高台と階段を設けます。幅・奥行64〜96m、道路幅4〜8m、高台0〜4m。最低1街区はplaza。建物は既存モデルを使います。\n平面の指定にはelevation=0、それ以外は2〜4mを目安に選択。任意の間取り、建物内部、曲線道路、ジャンプ経路はこの方式の範囲外です。intentで採用した要素と対応できない要求を日本語で説明してください。`;
}

// Invalid plans are repaired as compact plans, rather than re-generating hundreds of coordinates.
export function generatePlannedCity(options) {
  return generatePlannedStage({ ...options, buildStage: buildCity, label: '都市', assemblyMessage: '道路・高台・階段・建物を組み立て、経路を検証しています。' });
}

import { buildNature, canonicalNaturePlan } from './natureGenerator.js';
import { analyzeWalkability } from './walkability.js';
import { createEmptyLogs } from './sampleProjects.js';

export function createNatureWorkspace(planInput, mode = 'free', participantId = 'User_01') {
  const plan = canonicalNaturePlan(planInput);
  const stage = buildNature(plan, mode);
  const navigation = analyzeWalkability(stage.objects);
  if (navigation.status !== 'checked') throw new Error('歩行経路を確認できませんでした。設定を変更してもう一度お試しください。');
  const spawn = stage.objects.find(o => o.role === 'spawn');
  return { project: {
    metadata: { game_mode: mode, theme: plan.waterEnabled ? '段状の地形と水辺' : '段状の渓谷', generator: 'procedural-nature', design_rationale: stage.design_rationale, nature_plan: plan },
    objects: stage.objects, logs: { ...createEmptyLogs(), participantId }, aiReview: null,
  }, editor: { inputText: '', dummyPos: [spawn.pos[0], spawn.pos[1] - spawn.size[1] / 2, spawn.pos[2]], showDummy: true, isPartialEdit: true } };
}

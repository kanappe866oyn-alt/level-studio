// Shared orchestration for compact AI plans and deterministic assembly.
export async function generatePlannedStage({ requestPlan, prompt, mode, signal, validateStage, buildStage, label, assemblyMessage, onStatus = () => {} }) {
  let repair = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    onStatus(attempt ? `${label}の設計案を修正しています。` : `AIが${label}の構成と高低差を設計しています。`);
    const plan = await requestPlan(prompt + repair);
    signal.throwIfAborted();
    try {
      onStatus(assemblyMessage);
      const stage = buildStage(plan, mode);
      const issues = validateStage(stage.objects, stage);
      if (issues.length) throw new Error(issues.slice(0, 6).join('\n'));
      return stage;
    } catch (error) {
      if (attempt === 2) throw error;
      repair = `\n前回の設計案: ${JSON.stringify(plan)}\n次の問題を修正した設計のJSONを出力してください: ${error.message}`;
    }
  }
}

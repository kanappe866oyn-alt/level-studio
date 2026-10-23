// The validated-brief pipeline still owns validation and repair. Only the first
// round trip is combined; a rejected draft uses the normal repair prompt.
export function createPairedStageDesigner({ basePrompt, requestDesign, requestRepair }) {
  let pendingStage;
  return {
    requestBrief: async prompt => {
      pendingStage = undefined;
      const result = await requestDesign(`${prompt}\n\n次の配置仕様も同時に満たしてください。\n${basePrompt}\n\n出力はbriefとstageのJSON。先にbriefで元の指示を整理し、その条件を満たすstageを設計してください。stageにはobjectsとdesign_rationaleを含めます。条件を勝手に弱めないでください。`);
      pendingStage = result?.stage;
      return result?.brief;
    },
    requestDraft: async prompt => {
      if (pendingStage !== undefined) {
        const stage = pendingStage;
        pendingStage = undefined;
        return stage;
      }
      return requestRepair(prompt);
    },
  };
}

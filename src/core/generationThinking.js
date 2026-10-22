// Keep Flash's internal reasoning bounded as well as its visible JSON output.
// Unknown/custom models retain provider defaults rather than guessing support.
export function generationThinking(model) {
  if (model === 'gemini-2.5-flash') return { thinkingConfig: { thinkingBudget: 1024 } };
  if (model === 'gemini-flash-latest' || /^gemini-3(?:\.\d+)?-flash(?:-preview)?$/.test(model)) {
    return { thinkingConfig: { thinkingLevel: 'low' } };
  }
  return {};
}

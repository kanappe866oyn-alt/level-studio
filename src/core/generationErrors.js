export function generationValidationError(message, step = 'drafting') {
  const error = new Error(message);
  error.code = 'GENERATION_VALIDATION';
  error.natureStep = step;
  return error;
}

// Read provider metadata, never include raw responses or credentials in errors.
export function readGenerationJSON(response) {
  const reason = response?.candidates?.[0]?.finishReason;
  const block = response?.promptFeedback?.blockReason;
  const fail = (code, message) => { const error = new Error(message); error.code = code; throw error; };
  if (reason === 'MAX_TOKENS') fail('AI_OUTPUT_LIMIT', 'AIの出力上限に達しました。');
  if (block || ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'].includes(reason)) fail('AI_RESPONSE_BLOCKED', 'AIが応答を返せませんでした。');
  if (reason && reason !== 'STOP') fail('AI_RESPONSE_INCOMPLETE', 'AIが応答を完了しませんでした。');
  let text;
  try { text = response.text(); } catch { fail('AI_RESPONSE_INCOMPLETE', 'AIから読み取れる応答がありません。'); }
  if (!text?.trim()) fail('AI_RESPONSE_INCOMPLETE', 'AIの応答が空です。');
  try { return JSON.parse(text); } catch { fail('AI_RESPONSE_FORMAT', 'AIの応答が指定したJSON形式になっていません。'); }
}

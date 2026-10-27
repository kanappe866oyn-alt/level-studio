// One instance belongs to one user generation action, outside retry loops.
// Reserve before awaiting so concurrent callers share the same hard limit.
export function createAIRequestBudget(limit = 3) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error('AI通信回数の上限が不正です。');
  let used = 0;
  return {
    // Requests actually started (a request served from the cache never reaches here).
    get used() { return used; },
    async run(operation, signal) {
      signal.throwIfAborted();
      if (used >= limit) {
        const error = new Error(`1回の生成操作でのAI通信を${limit}回までに制限して停止しました。既存のマップは保持しています。条件を整理してから再試行してください。`);
        error.code = 'AI_REQUEST_LIMIT';
        throw error;
      }
      used++;
      return operation();
    },
  };
}

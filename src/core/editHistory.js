// Enter followed by blur can commit the same edit twice. A no-op must also
// preserve the redo branch rather than silently discarding it.
export function appendEditHistory(history, step, objects, limit = 50) {
  if (JSON.stringify(history[step]) === JSON.stringify(objects)) return null;
  const next = [...history.slice(0, step + 1), objects].slice(-limit);
  return { history: next, step: next.length - 1 };
}

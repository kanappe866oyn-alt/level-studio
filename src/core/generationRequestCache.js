// Scoped to one Generate action. Completed steps survive a transient retry;
// rejected requests and results from cancelled work never enter the cache.
export function createGenerationRequestCache(request) {
  const completed = new Map();
  return async options => {
    options.signal.throwIfAborted();
    const key = JSON.stringify([options.step, options.parts]);
    if (completed.has(key)) return structuredClone(completed.get(key));
    const result = await request(options);
    options.signal.throwIfAborted();
    completed.set(key, structuredClone(result));
    return result;
  };
}

export function getStairLayout(size) {
  const count = Math.max(1, Math.round(size[1] / 0.4));
  return { count, stepHeight: size[1] / count, stepDepth: size[2] / count };
}

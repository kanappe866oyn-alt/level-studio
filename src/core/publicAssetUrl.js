// Keep saved model identifiers root-relative; only adapt URLs at the load boundary.
export function publicAssetUrl(url, base = import.meta.env?.BASE_URL || '/') {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) return url;
  const prefix = base.endsWith('/') ? base : `${base}/`;
  if (prefix !== '/' && url.startsWith(prefix)) return url;
  return `${prefix}${url.slice(1)}`;
}

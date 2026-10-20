import release from '../data/desktopRelease.json' with { type: 'json' };

export function desktopDownload({ url = '', hostname = '' } = {}) {
  const configured = url.trim() || release.url;
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol === 'https:' && !parsed.username && !parsed.password && /\.zip$/i.test(parsed.pathname)) {
        return { ...release, available: true, url: parsed.href, local: false };
      }
    } catch { /* An invalid public URL never becomes a broken download button. */ }
  }
  if (['localhost', '127.0.0.1', '[::1]'].includes(hostname)) return { ...release, available: true, url: `/downloads/${release.fileName}`, local: true };
  return { ...release, available: false, url: '', local: false };
}

import release from '../data/desktopRelease.json' with { type: 'json' };

export function desktopDownload({ url = '', hostname = '', releaseInfo = release } = {}) {
  const configured = url.trim() || releaseInfo.url;
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol === 'https:' && !parsed.username && !parsed.password && /\.zip$/i.test(parsed.pathname)) {
        return { ...releaseInfo, available: true, url: parsed.href, local: false };
      }
    } catch { /* An invalid public URL never becomes a broken download button. */ }
  }
  if (['localhost', '127.0.0.1', '[::1]'].includes(hostname)) return { ...releaseInfo, available: true, url: `/downloads/${releaseInfo.fileName}`, local: true };
  return { ...releaseInfo, available: false, url: '', local: false };
}

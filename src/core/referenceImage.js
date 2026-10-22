export const REFERENCE_IMAGE_MAX_EDGE = 2048;

// Keep the reference's aspect ratio and transparency; never crop its layout.
export function referenceImageSize(width, height) {
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) throw new Error('参考画像のサイズを読み取れませんでした。');
  const scale = Math.min(1, REFERENCE_IMAGE_MAX_EDGE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export async function prepareReferenceImage(file) {
  if (typeof createImageBitmap !== 'function') return file;
  const bitmap = await createImageBitmap(file);
  try {
    const size = referenceImageSize(bitmap.width, bitmap.height);
    if (size.width === bitmap.width && size.height === bitmap.height) return file;
    const canvas = document.createElement('canvas');
    canvas.width = size.width; canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('参考画像を送信用に調整できませんでした。');
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const mime = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('参考画像の変換に失敗しました。')), mime, 0.9));
  } finally { bitmap.close(); }
}

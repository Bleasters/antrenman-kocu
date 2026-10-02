import { fitWithin, JPEG_QUALITY, MAX_EDGE, THUMB_EDGE } from '../logic/imageSize';

type Source = ImageBitmap | HTMLImageElement;

/** Decodes with EXIF orientation applied (createImageBitmap 'from-image'; <img> fallback). */
async function decode(file: Blob): Promise<Source> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* older Safari: fall through */
    }
  }
  // <img> applies EXIF orientation by default in modern browsers (image-orientation: from-image)
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function render(src: Source, maxEdge: number, quality: number): Promise<Blob> {
  const w = 'naturalWidth' in src ? src.naturalWidth : src.width;
  const h = 'naturalHeight' in src ? src.naturalHeight : src.height;
  const size = fitWithin(w, h, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas desteklenmiyor');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, size.width, size.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Görsel sıkıştırılamadı'))), 'image/jpeg', quality),
  );
}

/** Long edge ≤ 1600 px, JPEG 0.8, plus a ~300 px thumbnail. */
export async function compressImage(file: Blob): Promise<{ blob: Blob; thumb: Blob }> {
  const src = await decode(file);
  try {
    const blob = await render(src, MAX_EDGE, JPEG_QUALITY);
    const thumb = await render(src, THUMB_EDGE, 0.7);
    return { blob, thumb };
  } finally {
    if ('close' in src) src.close();
  }
}

// Player photos are stored in the database as data URLs, so the client
// must shrink them aggressively before upload: a phone camera shot is
// 3-8 MB, but a 256px JPEG head-shot is ~20-60 KB — small enough to keep
// rows light and well under the API's 1 MB body limit. Tactical diagrams
// (session-plan blocks) need more detail to stay legible, so they pass a
// larger maxDimension explicitly.
const MAX_DIMENSION = 256;
const JPEG_QUALITY = 0.82;

export function compressImageFile(file: File, maxDimension: number = MAX_DIMENSION): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas not supported'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image'));
    };
    img.src = url;
  });
}

// Browser-side image preparation. Vercel limits a request body to ~4.5 MB, far below what a phone
// camera produces, so photos are scaled down and re-encoded before upload. The server still
// re-validates and strips metadata; this only makes the upload fit.

const MAX_SIDE = 2000;
const TARGET_BYTES = 3 * 1024 * 1024;

export async function prepareImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file; // PDFs and others pass through untouched
  if (file.size <= TARGET_BYTES && file.type !== 'image/heic' && file.type !== 'image/heif') {
    return file;
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let quality = 0.88;
  let blob: Blob | null = null;
  for (let i = 0; i < 5; i++) {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= TARGET_BYTES) break;
    quality -= 0.12;
  }
  if (!blob) throw new Error('No se pudo preparar la imagen');
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}

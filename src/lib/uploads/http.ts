import type { InvalidUploadReason } from './errors';

export class BodyTooLargeError extends Error {
  constructor() {
    super('Request body too large');
    this.name = 'BodyTooLargeError';
  }
}

// Parses a multipart body while never buffering more than `maxBytes`
// (Content-Length is checked up front, and the stream is cut if it lies).
// Throws BodyTooLargeError when over the limit; returns null if unparseable.
export async function readMultipart(req: Request, maxBytes: number): Promise<FormData | null> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError();
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  const contentType = req.headers.get('content-type') ?? '';
  try {
    return await new Response(Buffer.concat(chunks), {
      headers: { 'content-type': contentType },
    }).formData();
  } catch {
    return null;
  }
}

export async function fileField(form: FormData, name: string): Promise<{ data: Buffer; type: string } | null> {
  const v = form.get(name);
  if (!(v instanceof Blob)) return null;
  return { data: Buffer.from(await v.arrayBuffer()), type: v.type };
}

// Spanish, user-facing messages for rejected uploads.
export function uploadErrorMessage(reason: InvalidUploadReason): string {
  switch (reason) {
    case 'too_large':
      return 'El archivo supera el límite de 8 MB.';
    case 'too_many_pixels':
      return 'La imagen es demasiado grande (máximo 8000 px por lado).';
    case 'corrupt':
      return 'No pudimos leer el archivo. Intenta con otra foto.';
    default:
      return 'Formato no permitido. Usa JPG, PNG, WebP o PDF.';
  }
}

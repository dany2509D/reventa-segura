import { del as blobDel, get as blobGet, put as blobPut } from '@vercel/blob';

// Private object storage. Paths are opaque keys produced by storePrivate();
// a store's own URLs are never handed to clients (see /api/files/[token]).
export interface BlobStore {
  put(path: string, data: Buffer): Promise<void>;
  get(path: string): Promise<Buffer | null>;
  del(path: string): Promise<void>;
}

// In-process store for tests and local development. Copies on the way in and
// out so callers cannot mutate stored bytes.
export class MemoryBlobStore implements BlobStore {
  private readonly items = new Map<string, Buffer>();

  async put(path: string, data: Buffer): Promise<void> {
    if (this.items.has(path)) throw new Error('Blob already exists');
    this.items.set(path, Buffer.from(data));
  }

  async get(path: string): Promise<Buffer | null> {
    const v = this.items.get(path);
    return v ? Buffer.from(v) : null;
  }

  async del(path: string): Promise<void> {
    this.items.delete(path);
  }
}

// Vercel Blob in private mode. Content type is forced to octet-stream so that a
// leaked Blob URL would download rather than render; the real type is
// detected from the bytes when served through /api/files.
export class VercelBlobStore implements BlobStore {
  constructor(private readonly token: string) {}

  async put(path: string, data: Buffer): Promise<void> {
    await blobPut(path, data, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: 'application/octet-stream',
      token: this.token,
    });
  }

  async get(path: string): Promise<Buffer | null> {
    const res = await blobGet(path, { access: 'private', useCache: false, token: this.token });
    if (!res || res.statusCode !== 200) return null;
    return Buffer.from(await new Response(res.stream).arrayBuffer());
  }

  async del(path: string): Promise<void> {
    await blobDel(path, { token: this.token });
  }
}

const g = globalThis as unknown as { __memoryBlobStore?: MemoryBlobStore };

export function getStore(): BlobStore {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) return new VercelBlobStore(token);
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Blob storage not configured: set BLOB_READ_WRITE_TOKEN');
  }
  return (g.__memoryBlobStore ??= new MemoryBlobStore());
}

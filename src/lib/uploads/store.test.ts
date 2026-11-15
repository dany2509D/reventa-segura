import { beforeEach, describe, expect, it, vi } from 'vitest';

const blob = vi.hoisted(() => ({
  put: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
}));
vi.mock('@vercel/blob', () => blob);

import { VercelBlobStore } from './store';

beforeEach(() => {
  blob.put.mockReset();
  blob.get.mockReset();
  blob.del.mockReset();
});

describe('VercelBlobStore', () => {
  const store = new VercelBlobStore('vercel_blob_rw_test_token');

  it('writes private, non-overwritable, opaque blobs and never returns the Blob URL', async () => {
    blob.put.mockResolvedValue({ url: 'https://store.private.blob.vercel-storage.com/x', pathname: 'x' });
    const result = await store.put('identity/u/f', Buffer.from('data'));
    expect(result).toBeUndefined();
    expect(blob.put).toHaveBeenCalledTimes(1);
    const [path, body, opts] = blob.put.mock.calls[0];
    expect(path).toBe('identity/u/f');
    expect(Buffer.from(body).toString()).toBe('data');
    expect(opts).toMatchObject({
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: 'application/octet-stream',
      token: 'vercel_blob_rw_test_token',
    });
  });

  it('reads a private blob into a Buffer', async () => {
    blob.get.mockResolvedValue({
      statusCode: 200,
      stream: new Blob([Buffer.from('bytes')]).stream(),
      headers: new Headers(),
      blob: {},
    });
    const got = await store.get('identity/u/f');
    expect(got?.toString()).toBe('bytes');
    expect(blob.get.mock.calls[0][0]).toBe('identity/u/f');
    expect(blob.get.mock.calls[0][1]).toMatchObject({ access: 'private', token: 'vercel_blob_rw_test_token' });
  });

  it('returns null when the blob does not exist', async () => {
    blob.get.mockResolvedValue(null);
    expect(await store.get('identity/u/missing')).toBeNull();
  });

  it('deletes by path', async () => {
    blob.del.mockResolvedValue(undefined);
    await store.del('identity/u/f');
    expect(blob.del.mock.calls[0][0]).toBe('identity/u/f');
    expect(blob.del.mock.calls[0][1]).toMatchObject({ token: 'vercel_blob_rw_test_token' });
  });
});

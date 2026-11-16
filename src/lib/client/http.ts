// Browser-side helpers: same-origin fetches that return a uniform result. Never import on the server.

export type ApiResult = { ok: boolean; status: number; data: Record<string, unknown> };

async function parse(res: Response): Promise<ApiResult> {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data: data && typeof data === 'object' ? data : {} };
}

export const postJson = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    .then(parse)
    .catch(networkError);

// The browser sets the multipart boundary and the Origin header itself.
export const postMultipart = (url: string, body: FormData) => fetch(url, { method: 'POST', body }).then(parse).catch(networkError);

export const deleteRequest = (url: string) => fetch(url, { method: 'DELETE' }).then(parse).catch(networkError);

const networkError = (): ApiResult => ({ ok: false, status: 0, data: { error: 'No pudimos conectarnos. Revisa tu internet e inténtalo de nuevo.' } });

/** The server's Spanish message when it sent one, otherwise a safe generic text. */
export function errorText(r: ApiResult, fallback = 'No se pudo completar la acción. Inténtalo de nuevo.'): string {
  return typeof r.data.error === 'string' && r.data.error ? r.data.error : fallback;
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

export class ApiError extends Error {
  constructor({ message, code, status, details }) {
    super(message);
    this.name = 'ApiError';
    this.code = code ?? 'REQUEST_FAILED';
    this.status = status ?? 0;
    this.details = details;
  }
}

/**
 * Thin fetch wrapper. Always sends the session cookie and normalises errors to
 * the { error: { code, message, details? } } shape the API returns.
 */
export async function apiRequest(path, { method = 'GET', body, headers, signal } = {}) {
  let response;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      credentials: 'include',
      signal,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError({
      message: 'Tidak dapat terhubung ke server. Periksa koneksi Anda.',
      code: 'NETWORK_ERROR',
    });
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    throw new ApiError({
      message: payload?.error?.message ?? 'Permintaan gagal diproses.',
      code: payload?.error?.code,
      status: response.status,
      details: payload?.error?.details,
    });
  }

  return payload;
}

/** Build a query string, dropping empty values. */
export function toQuery(params = {}) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `?${query}` : '';
}

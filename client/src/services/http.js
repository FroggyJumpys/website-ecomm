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

/** The body of a response, or an `ApiError` when the status is not a success. */
async function readResponse(response) {
  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json().catch(() => null) : null;

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

/** A transport failure is a client-visible error with its own code. */
function networkError(error) {
  if (error.name === 'AbortError') return error;

  return new ApiError({
    message: 'Tidak dapat terhubung ke server. Periksa koneksi Anda.',
    code: 'NETWORK_ERROR',
  });
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
    throw networkError(error);
  }

  return readResponse(response);
}

/**
 * Multipart upload. The browser must set `Content-Type` itself so the multipart
 * boundary stays intact, so this deliberately sends no JSON content type.
 * Used by the panel's image upload; every other call goes through `apiRequest`.
 */
export async function apiUpload(path, formData, { signal } = {}) {
  let response;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      signal,
      headers: { Accept: 'application/json' },
      body: formData,
    });
  } catch (error) {
    throw networkError(error);
  }

  return readResponse(response);
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

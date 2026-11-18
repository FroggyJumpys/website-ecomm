import { apiRequest } from './http.js';

/**
 * Auth services. The session is an httpOnly cookie, so nothing here ever reads
 * a token; signing in and out is entirely a server-side cookie exchange.
 */

export async function fetchSession() {
  try {
    return await apiRequest('/auth/me');
  } catch (error) {
    // A guest is not an error to the client; anything else still is.
    if (error.status === 401) return { data: null };
    throw error;
  }
}

export function login(credentials) {
  // Ignore a legacy `remember` field if an old client still sends one: the
  // server sets the cookie's lifetime itself and its login body is strict.
  const { remember: _remember, ...body } = credentials ?? {};

  return apiRequest('/auth/login', { method: 'POST', body });
}

export function register(payload) {
  return apiRequest('/auth/register', { method: 'POST', body: payload });
}

export function logout() {
  return apiRequest('/auth/logout', { method: 'POST' });
}

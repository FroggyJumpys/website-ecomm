import { apiRequest } from './http.js';
import { USE_MOCKS } from '../lib/config.js';
import * as mockAuth from '../mocks/auth.js';

/**
 * Auth services. The real endpoints arrive in step 04b with the same payloads:
 * the session is an httpOnly cookie, so nothing here ever reads a token.
 */

export async function fetchSession() {
  if (USE_MOCKS) return mockAuth.getSession();

  try {
    return await apiRequest('/auth/me');
  } catch (error) {
    // A guest is not an error to the client; anything else still is.
    if (error.status === 401) return { data: null };
    throw error;
  }
}

export function login(credentials) {
  if (USE_MOCKS) return mockAuth.login(credentials);

  // `remember` only matters for the mock session; the server sets cookie
  // lifetime itself.
  const { remember: _remember, ...body } = credentials ?? {};

  return apiRequest('/auth/login', { method: 'POST', body });
}

export function register(payload) {
  if (USE_MOCKS) return mockAuth.register(payload);

  return apiRequest('/auth/register', { method: 'POST', body: payload });
}

export function logout() {
  if (USE_MOCKS) return mockAuth.logout();

  return apiRequest('/auth/logout', { method: 'POST' });
}

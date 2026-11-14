import { DEMO_ACCOUNTS } from '../lib/demoAccounts.js';
import { normalizePhone } from '../lib/validation.js';

/**
 * Mock auth backend. Accounts and the session live in browser storage so the
 * reviewer can reload without losing the signed-in state; step 04b replaces
 * all of this with bcrypt hashes and an httpOnly JWT cookie.
 *
 * Passwords are kept as an unsalted SHA-256 digest only so plain text does not
 * end up in localStorage. That is not password storage and must not be copied
 * to the server.
 */

const USERS_KEY = 'badekor.mock.users';
const SESSION_KEY = 'badekor.mock.session';

const AUTH_LATENCY_MS = 480;
const ACCOUNT_LATENCY_MS = 360;
const LOGOUT_LATENCY_MS = 200;

function delay(ms, value = null) {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function authError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest('SHA-256', bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
  };
}

function readUsers() {
  try {
    const raw = window.localStorage.getItem(USERS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    /* unreadable or corrupt payload: fall back to the seed below */
  }

  return null;
}

function writeUsers(users) {
  try {
    window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch {
    /* storage blocked or full: the mock keeps working for this page load */
  }
}

async function loadUsers() {
  const stored = readUsers();
  if (stored) return stored;

  const seeded = [];

  for (const [index, account] of DEMO_ACCOUNTS.entries()) {
    seeded.push({
      id: index + 1,
      name: account.name,
      email: account.email,
      phone: account.phone,
      role: account.role,
      passwordHash: await sha256(account.password),
      createdAt: new Date().toISOString(),
    });
  }

  writeUsers(seeded);

  return seeded;
}

/** The signed-in user's id, or null for a guest. Used by the account mocks. */
export function getSessionUserId() {
  const session = readSession();
  return session?.userId ?? null;
}

function readSession() {
  try {
    for (const storage of [window.localStorage, window.sessionStorage]) {
      const raw = storage.getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch {
    /* storage blocked: behave like a signed-out visitor */
  }

  return null;
}

/** "Remember me" decides whether the session outlives the browser tab. */
function writeSession(userId, remember) {
  const payload = JSON.stringify({ userId, signedInAt: new Date().toISOString() });

  try {
    window.localStorage.removeItem(SESSION_KEY);
    window.sessionStorage.removeItem(SESSION_KEY);
    (remember ? window.localStorage : window.sessionStorage).setItem(SESSION_KEY, payload);
  } catch {
    /* storage blocked: the session simply lasts until reload */
  }
}

function clearSession() {
  try {
    window.localStorage.removeItem(SESSION_KEY);
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** Restores the signed-in user, or `{ data: null }` for a guest. */
export async function getSession() {
  const session = readSession();
  if (!session) return { data: null };

  const users = await loadUsers();
  const user = users.find((item) => item.id === session.userId);

  if (!user) {
    clearSession();
    return { data: null };
  }

  return { data: toPublicUser(user) };
}

export async function login({ email, password, remember = false } = {}) {
  const users = await loadUsers();
  const normalizedEmail = String(email ?? '')
    .trim()
    .toLowerCase();
  const passwordHash = await sha256(String(password ?? ''));

  await delay(AUTH_LATENCY_MS);

  const user = users.find((item) => item.email.toLowerCase() === normalizedEmail);

  if (!user || user.passwordHash !== passwordHash) {
    throw authError('INVALID_CREDENTIALS', 'Email atau kata sandi salah.', 401);
  }

  writeSession(user.id, remember);

  return { data: toPublicUser(user) };
}

export async function register({ name, email, phone, password } = {}) {
  const users = await loadUsers();
  const normalizedEmail = String(email ?? '')
    .trim()
    .toLowerCase();

  await delay(AUTH_LATENCY_MS);

  if (users.some((item) => item.email.toLowerCase() === normalizedEmail)) {
    throw authError(
      'EMAIL_TAKEN',
      'Email ini sudah terdaftar. Coba masuk dengan email tersebut.',
      409
    );
  }

  const user = {
    id: Math.max(0, ...users.map((item) => Number(item.id) || 0)) + 1,
    name: String(name ?? '').trim(),
    email: normalizedEmail,
    phone: normalizePhone(String(phone ?? '').trim()),
    role: 'customer',
    passwordHash: await sha256(String(password ?? '')),
    createdAt: new Date().toISOString(),
  };

  writeUsers([...users, user]);
  writeSession(user.id, false);

  return { data: toPublicUser(user) };
}

/** Updates name, email and phone for the signed-in user. */
export async function updateProfile({ name, email, phone } = {}) {
  const users = await loadUsers();
  const userId = getSessionUserId();
  const index = users.findIndex((item) => item.id === userId);

  await delay(ACCOUNT_LATENCY_MS);

  if (index === -1) {
    throw authError(
      'UNAUTHENTICATED',
      'Sesi kamu sudah berakhir. Masuk lagi untuk melanjutkan.',
      401
    );
  }

  const normalizedEmail = String(email ?? '')
    .trim()
    .toLowerCase();

  if (
    users.some(
      (item, itemIndex) => itemIndex !== index && item.email.toLowerCase() === normalizedEmail
    )
  ) {
    throw authError('EMAIL_TAKEN', 'Email ini sudah dipakai akun lain. Gunakan email lain.', 409);
  }

  const updated = {
    ...users[index],
    name: String(name ?? '').trim(),
    email: normalizedEmail,
    phone: normalizePhone(String(phone ?? '').trim()),
    updatedAt: new Date().toISOString(),
  };

  const next = [...users];
  next[index] = updated;
  writeUsers(next);

  return { data: toPublicUser(updated) };
}

/** Verifies the current password before replacing the stored digest. */
export async function changePassword({ currentPassword, newPassword } = {}) {
  const users = await loadUsers();
  const userId = getSessionUserId();
  const index = users.findIndex((item) => item.id === userId);

  await delay(ACCOUNT_LATENCY_MS);

  if (index === -1) {
    throw authError(
      'UNAUTHENTICATED',
      'Sesi kamu sudah berakhir. Masuk lagi untuk melanjutkan.',
      401
    );
  }

  const currentHash = await sha256(String(currentPassword ?? ''));

  if (users[index].passwordHash !== currentHash) {
    throw authError('INVALID_PASSWORD', 'Kata sandi saat ini tidak cocok.', 400);
  }

  if (String(newPassword ?? '') === String(currentPassword ?? '')) {
    throw authError('SAME_PASSWORD', 'Kata sandi baru harus berbeda dari yang sekarang.', 400);
  }

  const next = [...users];
  next[index] = {
    ...users[index],
    passwordHash: await sha256(String(newPassword ?? '')),
    updatedAt: new Date().toISOString(),
  };
  writeUsers(next);

  return { data: null };
}

export async function logout() {
  await delay(LOGOUT_LATENCY_MS);
  clearSession();

  return { data: null };
}

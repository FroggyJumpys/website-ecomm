import { login, register } from '../services/auth.js';
import { clearSession, issueSession } from '../lib/session.js';

/**
 * Auth endpoints. Controllers own the HTTP details — status code, session
 * cookie, response envelope — and delegate the decisions to the auth service.
 */

/** Registering signs the customer in straight away, as the mock does. */
export async function postRegister(req, res) {
  const user = await register(req.body);

  issueSession(res, user.id);

  res.status(201).json({ data: user });
}

export async function postLogin(req, res) {
  const user = await login(req.body);

  issueSession(res, user.id);

  res.json({ data: user });
}

/** Idempotent: signing out twice is fine, and a guest can call it too. */
export async function postLogout(req, res) {
  clearSession(res);

  res.json({ data: null });
}

/** Reached only through `requireAuth`, so `req.user` exists. */
export function getMe(req, res) {
  res.json({ data: req.user });
}

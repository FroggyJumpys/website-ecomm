import { AppError } from '../lib/errors.js';

/**
 * Refuses admin writes that a browser says came from another site.
 *
 * The session cookie is `SameSite=Lax`, which already blocks cross-site POSTs
 * from a form, but the admin API is worth the second lock: `Origin` and
 * `Sec-Fetch-Site` are the headers browsers are not allowed to forge from
 * script, so a mismatch here means the request really did start somewhere else.
 *
 * Requests with neither header are allowed. Command-line clients, curl and the
 * integration tests send neither, and refusing them would break the documented
 * `curl` verification without adding any protection to a browser attacker (who
 * cannot omit the headers).
 */
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const ALLOWED_FETCH_SITES = new Set(['same-origin', 'none']);

export function createVerifyAdminOrigin({ clientOrigin }) {
  return function verifyAdminOrigin(req, _res, next) {
    if (!UNSAFE_METHODS.has(req.method)) return next();

    const origin = req.get('origin');

    if (origin !== undefined && origin !== clientOrigin) return next(crossSite());

    const fetchSite = req.get('sec-fetch-site');

    if (fetchSite !== undefined && !ALLOWED_FETCH_SITES.has(fetchSite)) return next(crossSite());

    return next();
  };
}

function crossSite() {
  return new AppError(
    403,
    'CROSS_SITE_REQUEST',
    'Permintaan ini berasal dari situs lain dan ditolak.'
  );
}

/**
 * Slug policy shared by products, categories and brands.
 *
 * Slugs are what the storefront URLs and the mock's filters already use, so the
 * conversion mirrors `client/src/lib/format.js` exactly: lowercase, accents
 * stripped, punctuation collapsed to single hyphens. A name that produces no
 * usable slug at all falls back to a generic base rather than an empty URL.
 *
 * Uniqueness is not an error here. The panel mock appends `-2`, `-3`, … so an
 * operator who types a name that already exists gets a working product instead
 * of a shrug, and the callers take the returned slug as the truth.
 */

/** The maximum slug length the database and the client agree on. */
export const MAX_SLUG_LENGTH = 80;

/** Lowercase ASCII words separated by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isSlug(value) {
  return typeof value === 'string' && value.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(value);
}

/**
 * The first free slug at or after `base`, with a numeric suffix when needed.
 *
 * `isTaken` is synchronous on purpose: callers hold the table's advisory lock
 * and load the existing slugs once, so the answer cannot change underneath the
 * loop. A base that would overflow the length limit is shortened before the
 * suffix is appended, never after, so the result is always a valid slug.
 */
export function suffixedSlug(base, isTaken) {
  const cleaned = isSlug(base) ? base : slugify(base) || 'item';
  const root = cleaned.length > MAX_SLUG_LENGTH - 6 ? cleaned.slice(0, MAX_SLUG_LENGTH - 6) : cleaned;

  if (!isTaken(root)) return root;

  for (let suffix = 2; ; suffix += 1) {
    const tail = `-${suffix}`;
    const trimmed = root.slice(0, MAX_SLUG_LENGTH - tail.length).replace(/-+$/, '');
    const candidate = `${trimmed}${tail}`;

    if (!isTaken(candidate)) return candidate;
  }
}

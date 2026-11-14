/**
 * Two-letter monogram for the header and the account sidebar. Falls back to a
 * single character for one-word names so the circle is never empty.
 */
export function initials(name) {
  return String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

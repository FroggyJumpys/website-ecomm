import { z } from 'zod';

/**
 * Catalogue query schemas.
 *
 * Query strings have no types and no shape of their own, so every value arrives
 * as a string (or, when a parameter repeats, as an array). These schemas are the
 * single place that decides defaults, bounds and the Indonesian messages the
 * API returns in `details.message`.
 *
 * The parameter names are the ones `client/src/lib/shopParams.js` already maps
 * onto (`search`, `category`, `brand`, `color`, `size`, `minPrice`, `maxPrice`,
 * `sort`, `page`, `limit`).
 */

export const SORT_OPTIONS = ['newest', 'price-asc', 'price-desc', 'rating'];
export const DEFAULT_SORT = 'newest';
export const DEFAULT_PAGE_SIZE = 9;
export const MAX_PAGE_SIZE = 100;

/** Longest search term accepted, so a giant `?search=` cannot reach trigram work. */
const MAX_SEARCH_LENGTH = 100;

/** Any raw query value: a string, a number, undefined, or a repeated parameter. */
const rawValue = z.union([z.string(), z.number(), z.array(z.string())]).optional();

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

/**
 * A single-valued trimmed text parameter. A repeated parameter
 * (`?category=a&category=b`) is a client bug, so it is rejected rather than
 * silently collapsed to the last value.
 */
function textParam({ label, maxLength } = {}) {
  return rawValue
    .refine((value) => !Array.isArray(value), {
      message: `Parameter ${label} hanya boleh diisi satu nilai.`,
    })
    .transform((value) => (isBlank(value) ? '' : String(value).trim()))
    .refine((value) => !maxLength || value.length <= maxLength, {
      message: `Kata kunci maksimal ${maxLength} karakter.`,
    });
}

/**
 * An optional whole number. Non-numeric input is an error rather than a silent
 * fallback, so `?page=dua` does not quietly return page 1.
 */
function intParam({ label, messagePrefix, min = 1, typeMessage } = {}) {
  const invalidType =
    typeMessage ??
    (min === 0
      ? `Harga ${label} harus angka Rupiah tanpa desimal.`
      : `${messagePrefix} harus berupa angka.`);

  return rawValue
    .refine((value) => !Array.isArray(value), {
      message: `Parameter ${label} hanya boleh diisi satu nilai.`,
    })
    .transform((value) => (isBlank(value) ? undefined : String(value).trim()))
    .refine((value) => value === undefined || /^-?\d+$/.test(value), {
      message: invalidType,
    })
    .transform((value) => (value === undefined ? undefined : Number(value)))
    .refine((value) => value === undefined || value >= min, {
      message:
        min === 0 ? `Harga ${label} tidak boleh negatif.` : `${messagePrefix} minimal ${min}.`,
    });
}

const pageParam = intParam({ label: 'halaman', messagePrefix: 'Halaman' });
const limitParam = intParam({ label: 'jumlah', messagePrefix: 'Jumlah per halaman' });
const minPriceParam = intParam({ label: 'minimal', messagePrefix: 'Harga minimal', min: 0 });
const maxPriceParam = intParam({ label: 'maksimal', messagePrefix: 'Harga maksimal', min: 0 });

const sortParam = rawValue
  .refine((value) => !Array.isArray(value), {
    message: 'Parameter urutan hanya boleh diisi satu nilai.',
  })
  .transform((value) => (SORT_OPTIONS.includes(value) ? value : DEFAULT_SORT));

export const productQuerySchema = z
  .object({
    search: textParam({ label: 'kata kunci', maxLength: MAX_SEARCH_LENGTH }),
    category: textParam({ label: 'kategori' }),
    brand: textParam({ label: 'merek' }),
    color: textParam({ label: 'warna' }),
    size: textParam({ label: 'ukuran' }),
    minPrice: minPriceParam,
    maxPrice: maxPriceParam,
    sort: sortParam,
    page: pageParam,
    limit: limitParam,
  })
  .transform((query) => ({
    search: query.search,
    category: query.category,
    brand: query.brand,
    color: query.color,
    size: query.size,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    sort: query.sort,
    page: query.page ?? 1,
    limit: Math.min(query.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  }))
  .refine(
    (query) =>
      query.minPrice === undefined ||
      query.maxPrice === undefined ||
      query.minPrice <= query.maxPrice,
    {
      message: 'Harga minimal tidak boleh lebih besar dari harga maksimal.',
      path: ['minPrice'],
    }
  );

export const relatedQuerySchema = z
  .object({ limit: limitParam })
  .transform((query) => ({ limit: Math.min(query.limit ?? 4, MAX_PAGE_SIZE) }));

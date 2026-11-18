/**
 * Shop-page state lives in the URL so filtering is shareable and the back
 * button works. URL param names are Bahasa Indonesia (they are user-facing);
 * the catalogue API expects English names, so the two are mapped here once
 * instead of in every component.
 *
 * The header, footer and home page already link with `?kategori=`, `?q=` and
 * `?sort=`, so those three names must not change without updating lib/nav.js.
 */
export const PARAM = {
  search: 'q',
  category: 'kategori',
  brand: 'merek',
  minPrice: 'min',
  maxPrice: 'maks',
  color: 'warna',
  size: 'ukuran',
  sort: 'sort',
  page: 'halaman',
  view: 'tampilan',
};

export const DEFAULT_SORT = 'newest';
export const PAGE_SIZE = 9;

/** Grid is the default; `?tampilan=daftar` switches to the list layout. */
export const VIEW = { grid: 'grid', list: 'daftar' };

function positiveInt(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.trunc(number);
}

function nonNegativeInt(value) {
  if (value === null || value === undefined || value === '') return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return undefined;
  return Math.trunc(number);
}

/** Anything unrecognised falls back to undefined so the API rejects nothing. */
function nonEmpty(value) {
  return value === null || value === undefined || value === '' ? undefined : value;
}

/** Read the shop filters out of the current search params. */
export function readFilters(searchParams) {
  const view = searchParams.get(PARAM.view);

  return {
    search: searchParams.get(PARAM.search) ?? '',
    category: searchParams.get(PARAM.category) ?? '',
    brand: searchParams.get(PARAM.brand) ?? '',
    color: searchParams.get(PARAM.color) ?? '',
    size: searchParams.get(PARAM.size) ?? '',
    minPrice: nonNegativeInt(searchParams.get(PARAM.minPrice)),
    maxPrice: nonNegativeInt(searchParams.get(PARAM.maxPrice)),
    sort: searchParams.get(PARAM.sort) ?? DEFAULT_SORT,
    page: positiveInt(searchParams.get(PARAM.page), 1),
    view: view === VIEW.list ? VIEW.list : VIEW.grid,
  };
}

/**
 * Turn the filter object into a new search params object. Empty filters are
 * dropped so the URL stays short and only carries real state.
 */
export function writeFilters(current, patch) {
  const next = { ...current, ...patch };
  const searchParams = new URLSearchParams();

  const set = (key, value) => {
    if (value !== undefined && value !== null && value !== '') searchParams.set(key, String(value));
  };

  set(PARAM.search, next.search);
  set(PARAM.category, next.category);
  set(PARAM.brand, next.brand);
  set(PARAM.color, next.color);
  set(PARAM.size, next.size);
  set(PARAM.minPrice, next.minPrice);
  set(PARAM.maxPrice, next.maxPrice);
  set(PARAM.sort, next.sort && next.sort !== DEFAULT_SORT ? next.sort : undefined);
  set(PARAM.page, next.page && next.page > 1 ? next.page : undefined);
  set(PARAM.view, next.view === VIEW.list ? VIEW.list : undefined);

  return searchParams;
}

/** Map the URL filters onto the query the catalogue API accepts. */
export function toApiParams(filters, limit = PAGE_SIZE) {
  return {
    search: nonEmpty(filters.search),
    category: nonEmpty(filters.category),
    brand: nonEmpty(filters.brand),
    color: nonEmpty(filters.color),
    size: nonEmpty(filters.size),
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    sort: filters.sort,
    page: filters.page,
    limit,
  };
}

/** How many facets are currently narrowing the result set. */
export function countActiveFilters(filters) {
  return [
    filters.search,
    filters.category,
    filters.brand,
    filters.color,
    filters.size,
    filters.minPrice,
    filters.maxPrice,
  ].filter((value) => value !== undefined && value !== null && value !== '').length;
}

/**
 * Swatches for the colour facet. Furniture colours are named per material, so
 * these are approximations of the real finishes, shown next to the text label
 * (never as the only signal).
 */
export const COLOR_SWATCH = {
  'Abu hangat': '#b3aca1',
  'Cokelat tua': '#4b3729',
  Krem: '#e9dfcd',
  Hitam: '#1b1917',
  'Ulin natural': '#7c5330',
  'Ulin gelap': '#3d2a1c',
  'Rotan natural': '#c9a878',
};

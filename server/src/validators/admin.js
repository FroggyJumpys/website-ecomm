import { z } from 'zod';
import { SLUG_PATTERN, MAX_SLUG_LENGTH } from '../lib/catalogSlug.js';
import { catalogImagePath } from '../lib/catalogImages.js';

/**
 * Admin catalogue request contracts.
 *
 * Every object is strict: the panel sends an editable record, and the only
 * fields it may set are the ones an administrator owns. Identity, rating,
 * review count and version are server-maintained, so a payload that includes
 * them is rejected — silently dropping `version` would hide a client that
 * thinks it can choose one.
 *
 * The routes are admin-only before any of this runs; these schemas assume the
 * caller is already authorised and only shape the data.
 */

/** The same ceiling the panel form enforces, in whole Rupiah. */
export const MAX_PRICE = 1_000_000_000_000;
export const MAX_STOCK = 1_000_000;
export const MAX_SORT_ORDER = 1_000_000;

const MAX_LIST_LIMIT = 100;
const DEFAULT_LIST_LIMIT = 20;
const MAX_PAGE = 1_000_000;
const MAX_SEARCH_LENGTH = 100;
const MAX_TEXT_ITEMS = 20;
const MAX_IMAGES = 10;

export const PRODUCT_VISIBILITY_VALUES = ['all', 'active', 'hidden'];
export const PRODUCT_SORT_VALUES = ['newest', 'name-asc', 'price-asc', 'price-desc'];

/** Route ids arrive as strings; anything that is not a positive integer is refused. */
export const adminIdSchema = z
  .string({ error: 'ID wajib berupa angka.' })
  .refine((value) => /^\d+$/.test(value), { message: 'ID harus berupa angka.' })
  .transform(Number)
  .refine((value) => Number.isSafeInteger(value) && value >= 1, {
    message: 'ID tidak valid.',
  });

/**
 * `req.params` wrapped so `parseBody` reports the failure against `id` — the
 * field name the panel's route already uses.
 */
export const adminIdParamsSchema = z.object({ id: adminIdSchema });

const slugField = z
  .string()
  .trim()
  .min(1, { message: 'Slug wajib diisi.' })
  .max(MAX_SLUG_LENGTH, { message: 'Slug maksimal 80 karakter.' })
  .refine((value) => SLUG_PATTERN.test(value), {
    message: 'Slug hanya huruf kecil, angka, dan tanda hubung.',
  });

/** Optional on create: a blank or absent slug is derived from the name. */
const optionalSlugField = z
  .string()
  .trim()
  .max(MAX_SLUG_LENGTH, { message: 'Slug maksimal 80 karakter.' })
  .refine((value) => value === '' || SLUG_PATTERN.test(value), {
    message: 'Slug hanya huruf kecil, angka, dan tanda hubung.',
  })
  .optional();

/**
 * Create accepts an omitted brand as "no brand"; PATCH must not, because an
 * omitted field there means "leave it alone". Sharing one normalising schema
 * between them would clear the brand on every rename.
 */
const brandSlugCreateField = z
  .union([z.string().trim().min(1).max(MAX_SLUG_LENGTH), z.null()])
  .optional()
  .transform((value) => (value === undefined || value === '' ? null : value));

const brandSlugPatchField = z
  .union([z.string().trim().min(1).max(MAX_SLUG_LENGTH), z.null()])
  .optional()
  .transform((value) => (value === '' ? null : value));

const priceField = z
  .number({ error: 'Harga wajib berupa angka Rupiah tanpa desimal.' })
  .refine((value) => Number.isSafeInteger(value) && value > 0, {
    message: 'Harga wajib berupa angka Rupiah tanpa desimal.',
  })
  .refine((value) => value <= MAX_PRICE, { message: 'Harga terlalu besar.' });

const stockField = z
  .number({ error: 'Stok harus angka 0 atau lebih.' })
  .refine((value) => Number.isSafeInteger(value) && value >= 0, {
    message: 'Stok harus angka 0 atau lebih.',
  })
  .refine((value) => value <= MAX_STOCK, { message: 'Stok terlalu besar.' });

const compareAtPriceValue = z
  .number({ error: 'Harga sebelum diskon harus angka Rupiah.' })
  .refine((value) => Number.isSafeInteger(value) && value > 0, {
    message: 'Harga sebelum diskon harus angka Rupiah.',
  })
  .refine((value) => value <= MAX_PRICE, { message: 'Harga sebelum diskon terlalu besar.' })
  .nullable();

const textListField = ({ label, min, max, allowedMax }) =>
  z
    .array(z.string(), { error: `Format ${label.toLowerCase()} tidak valid.` })
    .max(allowedMax, { message: `${label} maksimal ${allowedMax} pilihan.` })
    .superRefine((values, context) => {
      values.forEach((value, index) => {
        const trimmed = value.trim();

        if (trimmed.length === 0) {
          context.addIssue({
            code: 'custom',
            message: `${label} tidak boleh kosong.`,
            path: [index],
          });
          return;
        }

        if (trimmed.length > max) {
          context.addIssue({
            code: 'custom',
            message: `${label} maksimal ${max} karakter.`,
            path: [index],
          });
        }
      });

      if (new Set(values.map((value) => value.trim())).size !== values.length) {
        context.addIssue({ code: 'custom', message: `${label} tidak boleh sama.` });
      }
    })
    .transform((values) => values.map((value) => value.trim()))
    .refine((values) => values.length >= min, {
      message: min === 1 ? `Tambahkan minimal satu ${label.toLowerCase()}.` : undefined,
    });

const colorsField = textListField({ label: 'Warna', min: 1, max: 60, allowedMax: MAX_TEXT_ITEMS });
const sizesField = textListField({ label: 'Ukuran', min: 0, max: 60, allowedMax: MAX_TEXT_ITEMS });

const imagesField = z
  .array(z.string(), { error: 'Format gambar tidak valid.' })
  .min(1, { message: 'Tambahkan minimal satu gambar produk.' })
  .max(MAX_IMAGES, { message: `Gambar maksimal ${MAX_IMAGES} file.` })
  .refine((values) => new Set(values.map((value) => value.trim())).size === values.length, {
    message: 'Gambar tidak boleh sama.',
  })
  .transform((values, context) =>
    values.map((value) => {
      try {
        return catalogImagePath(value);
      } catch (error) {
        context.addIssue({ code: 'custom', message: error.message });
        return z.NEVER;
      }
    })
  );

const categorySlugFieldFor = (label) =>
  z
    .string({ error: label })
    .trim()
    .min(1, { message: label })
    .max(MAX_SLUG_LENGTH, { message: 'Slug tidak valid.' });

const nameField = ({ label, min, max }) =>
  z
    .string({ error: `${label} wajib diisi.` })
    .trim()
    .min(1, { message: `${label} wajib diisi.` })
    .min(min, { message: `${label} minimal ${min} karakter.` })
    .max(max, { message: `${label} maksimal ${max} karakter.` });

/* ------------------------------------------------------------------ products */

const productShape = {
  name: nameField({ label: 'Nama produk', min: 3, max: 120 }),
  slug: optionalSlugField,
  categorySlug: categorySlugFieldFor('Pilih kategori yang terdaftar.'),
  brandSlug: brandSlugCreateField,
  price: priceField,
  compareAtPrice: compareAtPriceValue.default(null),
  stock: stockField.default(0),
  material: nameField({ label: 'Bahan', min: 1, max: 120 }),
  dimensions: nameField({ label: 'Dimensi', min: 1, max: 60 }),
  description: nameField({ label: 'Deskripsi', min: 1, max: 800 }),
  colors: colorsField,
  sizes: sizesField.default([]),
  images: imagesField,
  isNew: z.boolean({ error: 'Penanda produk baru harus berupa benar atau salah.' }).default(false),
  isTrending: z
    .boolean({ error: 'Penanda trending harus berupa benar atau salah.' })
    .default(false),
  isActive: z
    .boolean({ error: 'Penanda tampil di toko harus berupa benar atau salah.' })
    .default(true),
};

export const productCreateSchema = z
  .object(productShape)
  .strict()
  .superRefine((product, context) => {
    if (product.compareAtPrice !== null && product.compareAtPrice <= product.price) {
      context.addIssue({
        code: 'custom',
        path: ['compareAtPrice'],
        message: 'Harga sebelum diskon harus lebih tinggi dari harga jual.',
      });
    }
  });

const versionField = z
  .number({ error: 'Versi produk wajib diisi.' })
  .refine((value) => Number.isSafeInteger(value) && value >= 1, {
    message: 'Versi produk tidak valid.',
  });

/**
 * Every field is optional and carries no default: in a patch, "absent" means
 * "leave it alone". Reusing the create schemas here would silently reset stock,
 * flags and arrays to their create defaults on every rename.
 */
const mutableProductShape = {
  name: nameField({ label: 'Nama produk', min: 3, max: 120 }).optional(),
  slug: slugField.optional(),
  categorySlug: categorySlugFieldFor('Pilih kategori yang terdaftar.').optional(),
  brandSlug: brandSlugPatchField,
  price: priceField.optional(),
  compareAtPrice: compareAtPriceValue.optional(),
  stock: stockField.optional(),
  material: nameField({ label: 'Bahan', min: 1, max: 120 }).optional(),
  dimensions: nameField({ label: 'Dimensi', min: 1, max: 60 }).optional(),
  description: nameField({ label: 'Deskripsi', min: 1, max: 800 }).optional(),
  colors: colorsField.optional(),
  sizes: sizesField.optional(),
  images: imagesField.optional(),
  isNew: z.boolean({ error: 'Penanda produk baru harus berupa benar atau salah.' }).optional(),
  isTrending: z.boolean({ error: 'Penanda trending harus berupa benar atau salah.' }).optional(),
  isActive: z
    .boolean({ error: 'Penanda tampil di toko harus berupa benar atau salah.' })
    .optional(),
};

export const productPatchSchema = z
  .object({ expectedVersion: versionField, ...mutableProductShape })
  .strict()
  .refine((patch) => Object.keys(patch).some((key) => key !== 'expectedVersion'), {
    message: 'Tidak ada data yang diubah.',
  });

/**
 * DELETE carries only the version the panel last saw. Kept separate from the
 * patch schema, which would also demand a mutable field.
 */
export const productDeleteSchema = z.object({ expectedVersion: versionField }).strict();

/* -------------------------------------------------------------- list query */

const rawValue = z.union([z.string(), z.number(), z.array(z.string())]).optional();

export function singleText({ label, maxLength = 200 }) {
  return rawValue
    .refine((value) => !Array.isArray(value), {
      message: `Parameter ${label} hanya boleh diisi satu nilai.`,
    })
    .transform((value) => (value === undefined || value === null ? '' : String(value).trim()))
    .refine((value) => value.length <= maxLength, {
      message: `Kata kunci maksimal ${maxLength} karakter.`,
    });
}

export function singleInt({ label, field, min, max, fallback }) {
  return rawValue
    .refine((value) => !Array.isArray(value), {
      message: `Parameter ${label} hanya boleh diisi satu nilai.`,
    })
    .transform((value) =>
      value === undefined || String(value).trim() === '' ? undefined : String(value).trim()
    )
    .refine((value) => value === undefined || /^\d+$/.test(value), {
      message: `Parameter ${label} harus berupa angka bulat.`,
    })
    .transform((value) => (value === undefined ? fallback : Number(value)))
    .refine((value) => value === undefined || (value >= min && value <= max), {
      message: `Parameter ${field} harus antara ${min} dan ${max}.`,
    });
}

export function singleEnum({ label, values, message, fallback }) {
  return rawValue
    .refine((value) => !Array.isArray(value), {
      message: `Parameter ${label} hanya boleh diisi satu nilai.`,
    })
    .transform((value) =>
      value === undefined || String(value).trim() === '' ? fallback : String(value).trim()
    )
    .refine((value) => values.includes(value), { message });
}

export const productListQuerySchema = z
  .object({
    page: singleInt({ label: 'halaman', field: 'page', min: 1, max: MAX_PAGE, fallback: 1 }),
    limit: singleInt({
      label: 'jumlah',
      field: 'limit',
      min: 1,
      max: MAX_LIST_LIMIT,
      fallback: DEFAULT_LIST_LIMIT,
    }),
    search: singleText({ label: 'kata kunci', maxLength: MAX_SEARCH_LENGTH }),
    category: singleText({ label: 'kategori', maxLength: MAX_SLUG_LENGTH }),
    brand: singleText({ label: 'merek', maxLength: MAX_SLUG_LENGTH }),
    visibility: singleEnum({
      label: 'tampilan',
      field: 'visibility',
      values: PRODUCT_VISIBILITY_VALUES,
      message: 'Filter tampilan tidak dikenal.',
      fallback: 'all',
    }),
    sort: singleEnum({
      label: 'urutan',
      field: 'sort',
      values: PRODUCT_SORT_VALUES,
      message: 'Urutan produk tidak dikenal.',
      fallback: 'newest',
    }),
  })
  .transform((query) => ({ ...query, limit: Math.min(query.limit, MAX_LIST_LIMIT) }));

/* -------------------------------------------------------------- categories */

const categoryName = nameField({ label: 'Nama kategori', min: 2, max: 60 });
const categoryDescriptionValue = z
  .string({ error: 'Deskripsi maksimal 200 karakter.' })
  .trim()
  .max(200, { message: 'Deskripsi maksimal 200 karakter.' });
const categoryImageValue = z
  .string({ error: 'Gunakan path gambar yang diawali /images/ atau hasil unggahan.' })
  .trim()
  .transform((value, context) => {
    if (value === '') return '';

    try {
      return catalogImagePath(value);
    } catch (error) {
      context.addIssue({ code: 'custom', message: error.message });
      return z.NEVER;
    }
  });
const sortOrderValue = z
  .number({ error: 'Urutan kategori harus angka 0 atau lebih.' })
  .refine((value) => Number.isSafeInteger(value) && value >= 0, {
    message: 'Urutan kategori harus angka 0 atau lebih.',
  })
  .refine((value) => value <= MAX_SORT_ORDER, { message: 'Urutan kategori terlalu besar.' });

export const categorySchema = z
  .object({
    name: categoryName,
    slug: optionalSlugField,
    description: categoryDescriptionValue.default(''),
    image: categoryImageValue.optional().default(''),
    sortOrder: sortOrderValue.default(0),
  })
  .strict();

/**
 * Same rule as products: a patch never re-applies a create default. An omitted
 * `description` must keep the stored text, not blank it.
 */
export const categoryPatchSchema = z
  .object({
    name: categoryName.optional(),
    slug: slugField.optional(),
    description: categoryDescriptionValue.optional(),
    image: categoryImageValue.optional(),
    sortOrder: sortOrderValue.optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Tidak ada data yang diubah.' });

/* ------------------------------------------------------------------ brands */

const brandName = nameField({ label: 'Nama merek', min: 2, max: 60 });

export const brandSchema = z.object({ name: brandName, slug: optionalSlugField }).strict();

export const brandPatchSchema = z
  .object({ name: brandName.optional(), slug: slugField.optional() })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Tidak ada data yang diubah.' });

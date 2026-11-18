import { describe, it, expect } from 'vitest';
import {
  productQuerySchema,
  relatedQuerySchema,
  SORT_OPTIONS,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '../validators/catalog.js';

function firstMessage(result) {
  return result.success ? null : result.error.issues[0].message;
}

describe('productQuerySchema', () => {
  it('applies the page and limit defaults the shop page expects', () => {
    const result = productQuerySchema.safeParse({});

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      page: 1,
      limit: DEFAULT_PAGE_SIZE,
      sort: 'newest',
      search: '',
      category: '',
      brand: '',
      color: '',
      size: '',
      minPrice: undefined,
      maxPrice: undefined,
    });
  });

  it('accepts the full filter set', () => {
    const result = productQuerySchema.safeParse({
      search: 'ulin',
      category: 'sofa',
      brand: 'ulin-kalsel',
      color: 'Ulin natural',
      size: '180 cm',
      minPrice: '1000000',
      maxPrice: '9000000',
      sort: 'price-desc',
      page: '2',
      limit: '12',
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      search: 'ulin',
      category: 'sofa',
      brand: 'ulin-kalsel',
      color: 'Ulin natural',
      size: '180 cm',
      minPrice: 1_000_000,
      maxPrice: 9_000_000,
      sort: 'price-desc',
      page: 2,
      limit: 12,
    });
  });

  it('trims the search term and keeps an empty search empty', () => {
    expect(productQuerySchema.parse({ search: '  ulin  ' }).search).toBe('ulin');
    expect(productQuerySchema.parse({ search: '   ' }).search).toBe('');
  });

  it('falls back to the default sort for an unknown value', () => {
    expect(productQuerySchema.parse({ sort: 'termurah' }).sort).toBe('newest');
  });

  it('accepts every documented sort option', () => {
    for (const sort of SORT_OPTIONS) {
      expect(productQuerySchema.parse({ sort })).toMatchObject({ sort });
    }
  });

  it('clamps a limit above the maximum instead of failing', () => {
    expect(productQuerySchema.parse({ limit: '500' }).limit).toBe(MAX_PAGE_SIZE);
  });

  it('rejects page 0 and a negative page', () => {
    expect(firstMessage(productQuerySchema.safeParse({ page: '0' }))).toBe('Halaman minimal 1.');
    expect(firstMessage(productQuerySchema.safeParse({ page: '-3' }))).toBe('Halaman minimal 1.');
  });

  it('rejects a limit below 1', () => {
    expect(firstMessage(productQuerySchema.safeParse({ limit: '0' }))).toBe(
      'Jumlah per halaman minimal 1.'
    );
  });

  it('rejects a non-numeric page', () => {
    expect(firstMessage(productQuerySchema.safeParse({ page: 'dua' }))).toBe(
      'Halaman harus berupa angka.'
    );
  });

  it('rejects a negative price bound', () => {
    expect(firstMessage(productQuerySchema.safeParse({ minPrice: '-1' }))).toBe(
      'Harga minimal tidak boleh negatif.'
    );
  });

  it('rejects a fractional price bound', () => {
    expect(firstMessage(productQuerySchema.safeParse({ maxPrice: '1.5' }))).toBe(
      'Harga maksimal harus angka Rupiah tanpa desimal.'
    );
  });

  it('rejects a price range whose minimum is above its maximum', () => {
    const result = productQuerySchema.safeParse({ minPrice: '9000000', maxPrice: '1000000' });

    expect(firstMessage(result)).toBe('Harga minimal tidak boleh lebih besar dari harga maksimal.');
  });

  it('accepts a price range with equal bounds', () => {
    const result = productQuerySchema.safeParse({ minPrice: '5000000', maxPrice: '5000000' });
    expect(result.success).toBe(true);
  });

  it('rejects a repeated scalar parameter instead of silently using the last value', () => {
    const result = productQuerySchema.safeParse({ category: ['sofa', 'kursi'] });

    expect(firstMessage(result)).toBe('Parameter kategori hanya boleh diisi satu nilai.');
  });

  it('rejects a repeated page parameter', () => {
    const result = productQuerySchema.safeParse({ page: ['1', '2'] });
    expect(firstMessage(result)).toBe('Parameter halaman hanya boleh diisi satu nilai.');
  });
});

describe('relatedQuerySchema', () => {
  it('defaults the limit to 4', () => {
    expect(relatedQuerySchema.parse({}).limit).toBe(4);
  });

  it('clamps a large limit', () => {
    expect(relatedQuerySchema.parse({ limit: '999' }).limit).toBe(MAX_PAGE_SIZE);
  });

  it('rejects a non-numeric limit', () => {
    expect(firstMessage(relatedQuerySchema.safeParse({ limit: 'banyak' }))).toBe(
      'Jumlah per halaman harus berupa angka.'
    );
  });
});

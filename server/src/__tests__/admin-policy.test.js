import { describe, it, expect } from 'vitest';
import { slugify, isSlug, suffixedSlug } from '../lib/catalogSlug.js';
import { catalogImagePath } from '../lib/catalogImages.js';
import { toSafeCatalogMoney } from '../lib/catalogMoney.js';

/**
 * Catalogue write policy: the three transformations that decide what an
 * administrator's input actually becomes.
 *
 *  - Slugs are derived and kept unique without asking the operator to invent a
 *    suffix, exactly as the panel mock did.
 *  - Images are paths the storefront can serve, never arbitrary URLs or
 *    filesystem locations.
 *  - Money is exact Rupiah, checked before it becomes a JSON number.
 */

describe('slugify', () => {
  it('turns a product name into the storefront slug', () => {
    expect(slugify('Sofa Ulin L-Shape')).toBe('sofa-ulin-l-shape');
  });

  it('strips accents and collapses punctuation runs', () => {
    expect(slugify('  Meja  Café — Rotan!!  ')).toBe('meja-cafe-rotan');
  });

  it('returns an empty string when nothing survives', () => {
    expect(slugify('!!!')).toBe('');
  });
});

describe('isSlug', () => {
  it('accepts the generated shape', () => {
    expect(isSlug('kursi-rotan-2')).toBe(true);
    expect(isSlug('a')).toBe(true);
  });

  it('rejects anything the database would refuse', () => {
    for (const bad of [
      'Kursi',
      'kursi_rotan',
      '-kursi',
      'kursi-',
      'kursi--rotan',
      'kursi rotan',
      'k'.repeat(81),
    ]) {
      expect(isSlug(bad)).toBe(false);
    }
  });
});

describe('suffixedSlug', () => {
  it('keeps the base when it is free', () => {
    expect(suffixedSlug('kursi', () => false)).toBe('kursi');
  });

  it('adds the first free numeric suffix', () => {
    const taken = new Set(['kursi', 'kursi-2']);
    expect(suffixedSlug('kursi', (slug) => taken.has(slug))).toBe('kursi-3');
  });

  it('never returns more than 80 characters', () => {
    const base = 'k'.repeat(79);
    const slug = suffixedSlug(base, (candidate) => candidate === base);

    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
    expect(isSlug(slug)).toBe(true);
  });

  it('falls back to a usable base when the truncated one is empty', () => {
    expect(suffixedSlug('', () => false)).toBe('item');
    expect(suffixedSlug('!!!', (candidate) => candidate === 'item')).toBe('item-2');
  });
});

describe('catalogImagePath', () => {
  it('accepts a seeded storefront path', () => {
    expect(catalogImagePath('/images/products/product1.jpg')).toBe('/images/products/product1.jpg');
    expect(catalogImagePath('/images/category/category-3.webp')).toBe(
      '/images/category/category-3.webp'
    );
  });

  it('accepts a generated upload path', () => {
    const path = '/api/v1/media/catalog/9f1c1c1e-6a3b-4a0e-8f2d-7c5b4a392817.webp';

    expect(catalogImagePath(path)).toBe(path);
  });

  it('rejects anything that is not one of those two shapes', () => {
    for (const bad of [
      'http://example.test/a.jpg',
      'https://example.test/a.jpg',
      '//example.test/a.jpg',
      '/images/../secret.jpg',
      '/images/%2e%2e/secret.jpg',
      '/images\\products\\product1.jpg',
      '/images/products/product1.jpg\0',
      '/images/products/product1.jpg?x=1',
      '/images/products/product1.jpg#x',
      '/uploads/product1.jpg',
      '/images/products/product1.gif',
      '/images/products/product1.svg',
      '/images/products/',
      `/images/products/${'a'.repeat(600)}.jpg`,
      '',
    ]) {
      expect(() => catalogImagePath(bad)).toThrow(
        expect.objectContaining({ status: 422, code: 'VALIDATION_ERROR' })
      );
    }
  });
});

describe('toSafeCatalogMoney', () => {
  it('converts exact Rupiah text to a number', () => {
    expect(toSafeCatalogMoney('0')).toBe(0);
    expect(toSafeCatalogMoney('1500000')).toBe(1_500_000);
    expect(toSafeCatalogMoney('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('refuses a value one above the safe range without rounding it first', () => {
    expect(() => toSafeCatalogMoney('9007199254740993')).toThrow(
      expect.objectContaining({ status: 409, code: 'CATALOG_VALUE_TOO_LARGE' })
    );
  });

  it('refuses negatives, fractions and non-numeric text', () => {
    for (const bad of ['-1', '1.5', '1e5', ' 12', '', 'abc']) {
      expect(() => toSafeCatalogMoney(bad)).toThrow(
        expect.objectContaining({ code: 'CATALOG_VALUE_TOO_LARGE' })
      );
    }
  });
});

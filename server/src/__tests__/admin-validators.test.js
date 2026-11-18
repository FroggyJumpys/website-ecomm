import { describe, it, expect } from 'vitest';
import {
  adminIdSchema,
  productCreateSchema,
  productPatchSchema,
  productListQuerySchema,
  categorySchema,
  categoryPatchSchema,
  brandSchema,
  brandPatchSchema,
} from '../validators/admin.js';

/**
 * Admin request contracts.
 *
 * The panel sends a whole editable record; the API accepts only the fields an
 * administrator may actually change. Rating, review count, identity and version
 * are server-owned, so a submitted `version` or `stock` is rejected rather than
 * silently ignored — a client that believes it is setting those is a client
 * with a bug worth surfacing.
 */

function firstIssue(result) {
  return result.success ? null : result.error.issues[0];
}

function product(overrides = {}) {
  return {
    name: 'Kursi Rotan',
    categorySlug: 'kursi',
    brandSlug: 'badekor-workshop',
    price: 1_500_000,
    stock: 6,
    material: 'Rotan',
    dimensions: '50 × 55 × 80 cm',
    description: 'Kursi rotan untuk ruang tamu.',
    colors: ['Rotan natural'],
    sizes: ['Standar'],
    images: ['/images/products/product3.jpg'],
    ...overrides,
  };
}

describe('adminIdSchema', () => {
  it('converts a decimal id', () => {
    expect(adminIdSchema.parse('12')).toBe(12);
  });

  it('rejects zero, negatives, fractions, text and unsafe values', () => {
    for (const bad of ['0', '-1', '1.5', 'abc', '9007199254740993', '']) {
      expect(adminIdSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('productCreateSchema', () => {
  it('accepts a complete product and applies the documented defaults', () => {
    expect(
      productCreateSchema.parse({
        name: '  Kursi Rotan  ',
        categorySlug: 'kursi',
        price: 1_500_000,
        material: 'Rotan',
        dimensions: '50 × 55 × 80 cm',
        description: 'Kursi rotan.',
        colors: ['Rotan natural'],
        images: ['/images/products/product3.jpg'],
      })
    ).toEqual({
      name: 'Kursi Rotan',
      slug: undefined,
      categorySlug: 'kursi',
      brandSlug: null,
      price: 1_500_000,
      compareAtPrice: null,
      stock: 0,
      material: 'Rotan',
      dimensions: '50 × 55 × 80 cm',
      description: 'Kursi rotan.',
      colors: ['Rotan natural'],
      sizes: [],
      images: ['/images/products/product3.jpg'],
      isNew: false,
      isTrending: false,
      isActive: true,
    });
  });

  it('accepts an explicit slug and a brand slug', () => {
    const parsed = productCreateSchema.parse(
      product({ slug: 'kursi-rotan-baru', brandSlug: 'badekor-workshop' })
    );

    expect(parsed.slug).toBe('kursi-rotan-baru');
    expect(parsed.brandSlug).toBe('badekor-workshop');
  });

  it('rejects a name that is too short or too long', () => {
    expect(firstIssue(productCreateSchema.safeParse(product({ name: 'ab' }))).message).toBe(
      'Nama produk minimal 3 karakter.'
    );
    expect(
      firstIssue(productCreateSchema.safeParse(product({ name: 'a'.repeat(121) }))).message
    ).toBe('Nama produk maksimal 120 karakter.');
    expect(firstIssue(productCreateSchema.safeParse(product({ name: '   ' }))).message).toBe(
      'Nama produk wajib diisi.'
    );
  });

  it('rejects an empty category slug', () => {
    expect(firstIssue(productCreateSchema.safeParse(product({ categorySlug: '' }))).message).toBe(
      'Pilih kategori yang terdaftar.'
    );
  });

  it('rejects a slug that is not kebab-case', () => {
    expect(
      firstIssue(productCreateSchema.safeParse(product({ slug: 'Kursi Rotan' }))).message
    ).toBe('Slug hanya huruf kecil, angka, dan tanda hubung.');
  });

  it('rejects a price that is not a positive whole Rupiah amount', () => {
    for (const price of [0, -1, 1.5, '1000', Number.MAX_SAFE_INTEGER + 2]) {
      expect(firstIssue(productCreateSchema.safeParse(product({ price }))).message).toBe(
        'Harga wajib berupa angka Rupiah tanpa desimal.'
      );
    }
  });

  it('rejects a price above the documented ceiling', () => {
    expect(
      firstIssue(productCreateSchema.safeParse(product({ price: 1_000_000_000_001 }))).message
    ).toBe('Harga terlalu besar.');
  });

  it('rejects a compare-at price that is not above the selling price', () => {
    expect(
      firstIssue(
        productCreateSchema.safeParse(product({ price: 2_000_000, compareAtPrice: 2_000_000 }))
      ).message
    ).toBe('Harga sebelum diskon harus lebih tinggi dari harga jual.');
  });

  it('rejects a stock that is negative, fractional or above the ceiling', () => {
    for (const stock of [-1, 1.5, '2']) {
      expect(firstIssue(productCreateSchema.safeParse(product({ stock }))).message).toBe(
        'Stok harus angka 0 atau lebih.'
      );
    }

    expect(firstIssue(productCreateSchema.safeParse(product({ stock: 1_000_001 }))).message).toBe(
      'Stok terlalu besar.'
    );
  });

  it('rejects empty and over-long detail text', () => {
    expect(firstIssue(productCreateSchema.safeParse(product({ material: '' }))).message).toBe(
      'Bahan wajib diisi.'
    );
    expect(
      firstIssue(productCreateSchema.safeParse(product({ dimensions: 'a'.repeat(61) }))).message
    ).toBe('Dimensi maksimal 60 karakter.');
    expect(
      firstIssue(productCreateSchema.safeParse(product({ description: 'a'.repeat(801) }))).message
    ).toBe('Deskripsi maksimal 800 karakter.');
  });

  it('requires at least one colour and rejects empty or duplicate entries', () => {
    expect(firstIssue(productCreateSchema.safeParse(product({ colors: [] }))).message).toBe(
      'Tambahkan minimal satu warna.'
    );
    expect(
      firstIssue(productCreateSchema.safeParse(product({ colors: ['Rotan', 'Rotan'] }))).message
    ).toBe('Warna tidak boleh sama.');
    expect(
      firstIssue(productCreateSchema.safeParse(product({ colors: ['Rotan', '  '] }))).message
    ).toBe('Warna tidak boleh kosong.');
  });

  it('limits the number of variants', () => {
    expect(
      productCreateSchema.safeParse(
        product({ colors: Array.from({ length: 21 }, (_, index) => `Warna ${index}`) })
      ).success
    ).toBe(false);
    expect(
      productCreateSchema.safeParse(
        product({ sizes: Array.from({ length: 21 }, (_, index) => `Ukuran ${index}`) })
      ).success
    ).toBe(false);
  });

  it('requires at least one image, limits their number and validates their paths', () => {
    expect(firstIssue(productCreateSchema.safeParse(product({ images: [] }))).message).toBe(
      'Tambahkan minimal satu gambar produk.'
    );
    expect(
      productCreateSchema.safeParse(
        product({ images: Array.from({ length: 11 }, () => '/images/products/product1.jpg') })
      ).success
    ).toBe(false);
    expect(
      firstIssue(productCreateSchema.safeParse(product({ images: ['http://evil.test/a.jpg'] })))
        .message
    ).toBe('Gunakan path gambar yang diawali /images/ atau hasil unggahan.');
  });

  it('rejects server-owned and unknown fields', () => {
    for (const extra of [
      { rating: 5 },
      { reviewCount: 3 },
      { id: 9 },
      { version: 2 },
      { createdAt: '2026-01-01' },
      { total: 10 },
      { categoryId: 1 },
    ]) {
      expect(productCreateSchema.safeParse(product(extra)).success).toBe(false);
    }
  });

  it('rejects a non-boolean flag instead of coercing it', () => {
    expect(productCreateSchema.safeParse(product({ isActive: 'true' })).success).toBe(false);
  });
});

describe('productPatchSchema', () => {
  it('accepts a version plus one mutable field', () => {
    expect(productPatchSchema.parse({ expectedVersion: 2, isActive: false })).toEqual({
      expectedVersion: 2,
      isActive: false,
    });
  });

  it('requires the version the form was read at', () => {
    expect(firstIssue(productPatchSchema.safeParse({ isActive: false })).message).toBe(
      'Versi produk wajib diisi.'
    );
  });

  it('requires at least one field besides the version', () => {
    expect(firstIssue(productPatchSchema.safeParse({ expectedVersion: 2 })).message).toBe(
      'Tidak ada data yang diubah.'
    );
  });

  it('rejects an unknown field and a string version', () => {
    expect(
      productPatchSchema.safeParse({ expectedVersion: 2, name: 'Baru', rating: 5 }).success
    ).toBe(false);
    expect(productPatchSchema.safeParse({ expectedVersion: '2', name: 'Baru' }).success).toBe(
      false
    );
  });

  it('does not apply create defaults to omitted fields', () => {
    expect(productPatchSchema.parse({ expectedVersion: 1, stock: 4 })).toEqual({
      expectedVersion: 1,
      stock: 4,
    });
  });
});

describe('productListQuerySchema', () => {
  it('applies the documented defaults', () => {
    expect(productListQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 20,
      search: '',
      category: '',
      brand: '',
      visibility: 'all',
      sort: 'newest',
    });
  });

  it('accepts the documented bounds', () => {
    expect(
      productListQuerySchema.parse({
        page: '1000000',
        limit: '100',
        visibility: 'hidden',
        sort: 'price-desc',
        search: ' kursi ',
      })
    ).toMatchObject({ page: 1_000_000, limit: 100, visibility: 'hidden', sort: 'price-desc' });
  });

  it('refuses a limit above the maximum instead of silently clamping it', () => {
    // The catalogue's public endpoint clamps; the admin list does not, because
    // an operator asking for 500 rows should be told the ceiling, not handed a
    // number the panel did not request.
    expect(firstIssue(productListQuerySchema.safeParse({ limit: '500' })).message).toBe(
      'Parameter limit harus antara 1 dan 100.'
    );
  });

  it('rejects repeated values and out-of-range paging', () => {
    expect(firstIssue(productListQuerySchema.safeParse({ page: ['1', '2'] })).message).toBe(
      'Parameter halaman hanya boleh diisi satu nilai.'
    );
    for (const page of ['0', '1000001', 'dua', '1.5']) {
      expect(productListQuerySchema.safeParse({ page }).success).toBe(false);
    }
  });

  it('rejects an unknown visibility or sort instead of defaulting it', () => {
    expect(firstIssue(productListQuerySchema.safeParse({ visibility: 'deleted' })).message).toBe(
      'Filter tampilan tidak dikenal.'
    );
    expect(firstIssue(productListQuerySchema.safeParse({ sort: 'rating' })).message).toBe(
      'Urutan produk tidak dikenal.'
    );
  });

  it('rejects an over-long search term', () => {
    expect(productListQuerySchema.safeParse({ search: 'a'.repeat(101) }).success).toBe(false);
  });
});

describe('categorySchema', () => {
  it('applies the documented defaults', () => {
    expect(categorySchema.parse({ name: '  Kursi  ' })).toEqual({
      name: 'Kursi',
      slug: undefined,
      description: '',
      image: '',
      sortOrder: 0,
    });
  });

  it('accepts a complete category', () => {
    expect(
      categorySchema.parse({
        name: 'Kursi',
        slug: 'kursi',
        description: 'Semua kursi.',
        image: '/images/category/category-1.jpg',
        sortOrder: 3,
      })
    ).toMatchObject({ slug: 'kursi', sortOrder: 3 });
  });

  it('bounds the name, description, order and image', () => {
    expect(firstIssue(categorySchema.safeParse({ name: 'a' })).message).toBe(
      'Nama kategori minimal 2 karakter.'
    );
    expect(firstIssue(categorySchema.safeParse({ name: 'a'.repeat(61) })).message).toBe(
      'Nama kategori maksimal 60 karakter.'
    );
    expect(
      firstIssue(categorySchema.safeParse({ name: 'Kursi', description: 'a'.repeat(201) })).message
    ).toBe('Deskripsi maksimal 200 karakter.');
    for (const sortOrder of [-1, 1_000_001, 1.5, '2']) {
      expect(categorySchema.safeParse({ name: 'Kursi', sortOrder }).success).toBe(false);
    }
    expect(categorySchema.safeParse({ name: 'Kursi', image: 'javascript:alert(1)' }).success).toBe(
      false
    );
  });

  it('rejects an unknown field', () => {
    expect(categorySchema.safeParse({ name: 'Kursi', productCount: 3 }).success).toBe(false);
  });
});

describe('categoryPatchSchema and brandPatchSchema', () => {
  it('require at least one mutable field', () => {
    expect(firstIssue(categoryPatchSchema.safeParse({})).message).toBe(
      'Tidak ada data yang diubah.'
    );
    expect(firstIssue(brandPatchSchema.safeParse({})).message).toBe('Tidak ada data yang diubah.');
  });

  it('accept the editable fields', () => {
    expect(categoryPatchSchema.parse({ sortOrder: 2 })).toEqual({ sortOrder: 2 });
    expect(brandPatchSchema.parse({ name: 'BaDekor' })).toEqual({ name: 'BaDekor' });
  });
});

describe('brandSchema', () => {
  it('applies the defaults and bounds the name', () => {
    expect(brandSchema.parse({ name: 'BaDekor' })).toEqual({
      name: 'BaDekor',
      slug: undefined,
    });
    expect(firstIssue(brandSchema.safeParse({ name: 'b' })).message).toBe(
      'Nama merek minimal 2 karakter.'
    );
    expect(brandSchema.safeParse({ name: 'BaDekor', description: 'x' }).success).toBe(false);
  });
});

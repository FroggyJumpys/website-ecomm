import { describe, it, expect } from 'vitest';
import { resolveTestDatabaseUrl } from '../config/testDatabase.js';

const DEV_URL = 'postgres://ba_dekor:ba_dekor@localhost:5433/ba_dekor';

describe('resolveTestDatabaseUrl', () => {
  it('derives a _test database from the development URL', () => {
    expect(resolveTestDatabaseUrl(DEV_URL)).toBe(
      'postgres://ba_dekor:ba_dekor@localhost:5433/ba_dekor_test'
    );
  });

  it('accepts an explicit URL that points at a _test database', () => {
    const url = 'postgres://someone:secret@db.internal:5432/shop_test';
    expect(resolveTestDatabaseUrl(DEV_URL, url)).toBe(url);
  });

  it('refuses an explicit URL that is not a _test database', () => {
    expect(() => resolveTestDatabaseUrl(DEV_URL, DEV_URL)).toThrow(/must end in "_test"/);
  });

  it('refuses an override with no database name at all', () => {
    expect(() =>
      resolveTestDatabaseUrl(DEV_URL, 'postgres://ba_dekor:ba_dekor@localhost:5433/')
    ).toThrow(/must end in "_test"/);
  });
});

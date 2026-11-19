import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DATABASE_URL,
  isPlaceholderPassword,
  parseDatabaseUrl,
  resolveDatabaseConfig,
} from '../config/databaseConfig.js';

const SUPABASE_POOLER_URL =
  'postgresql://postgres.project-ref:REPLACE_ME@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres';

describe('databaseConfig', () => {
  it('keeps the local database and disables SSL by default', () => {
    const config = resolveDatabaseConfig({
      DATABASE_PROVIDER: 'local',
      DATABASE_URL: 'postgres://ba_dekor:ba_dekor@localhost:5433/ba_dekor',
    });

    expect(config.provider).toBe('local');
    expect(config.url).toBe('postgres://ba_dekor:ba_dekor@localhost:5433/ba_dekor');
    expect(config.ssl).toBeNull();
  });

  it('falls back to the documented local default', () => {
    const config = resolveDatabaseConfig({ DATABASE_PROVIDER: 'local' });

    expect(config.url).toBe(DEFAULT_DATABASE_URL);
  });

  it('builds a Supabase URL from the pooler URL and a placeholder password', () => {
    const config = resolveDatabaseConfig({
      DATABASE_PROVIDER: 'supabase',
      SUPABASE_POOLER_URL,
      SUPABASE_PASS: 'real-password',
    });

    expect(config.provider).toBe('supabase');
    expect(config.url).toBe(
      'postgresql://postgres.project-ref:real-password@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres'
    );
    expect(config.ssl).toEqual({ rejectUnauthorized: false });
  });

  it('accepts the direct Supabase connection as a fallback', () => {
    const config = resolveDatabaseConfig({
      DATABASE_PROVIDER: 'supabase',
      SUPABASE_CONN:
        'postgresql://postgres:[YOUR-DATABASE-PASSWORD]@db.project-ref.supabase.co:5432/postgres',
      SUPABASE_DB_PASSWORD: 'real-password',
    });

    expect(config.url).toContain('real-password@db.project-ref.supabase.co');
    expect(config.ssl).toEqual({ rejectUnauthorized: false });
  });

  it('requires a Supabase connection URL in supabase mode', () => {
    expect(() => resolveDatabaseConfig({ DATABASE_PROVIDER: 'supabase' })).toThrow(
      /SUPABASE_POOLER_URL or SUPABASE_CONN/
    );
  });

  it('refuses a placeholder password when no password variable is set', () => {
    expect(() =>
      resolveDatabaseConfig({
        DATABASE_PROVIDER: 'supabase',
        SUPABASE_POOLER_URL,
      })
    ).toThrow(/SUPABASE_DB_PASSWORD or SUPABASE_PASS/);
  });

  it('strips sslmode from the URL and enables SSL explicitly', () => {
    const config = resolveDatabaseConfig({
      DATABASE_PROVIDER: 'local',
      DATABASE_URL: 'postgres://ba_dekor:ba_dekor@localhost:5433/ba_dekor?sslmode=require',
    });

    expect(config.url).not.toContain('sslmode');
    expect(config.ssl).toEqual({ rejectUnauthorized: false });
  });

  it('supports explicit SSL overrides', () => {
    const disabled = resolveDatabaseConfig({
      DATABASE_PROVIDER: 'local',
      DATABASE_URL: 'postgres://ba_dekor:ba_dekor@localhost:5432/ba_dekor',
      DATABASE_SSL: false,
    });
    const enabled = resolveDatabaseConfig({
      DATABASE_PROVIDER: 'local',
      DATABASE_URL: 'postgres://ba_dekor:ba_dekor@localhost:5432/ba_dekor',
      DATABASE_SSL: true,
      DATABASE_SSL_REJECT_UNAUTHORIZED: true,
    });

    expect(disabled.ssl).toBeNull();
    expect(enabled.ssl).toEqual({ rejectUnauthorized: true });
  });

  it('rejects non-PostgreSQL URLs', () => {
    expect(() =>
      parseDatabaseUrl('mysql://user:pass@localhost:3306/shop', { label: 'DATABASE_URL' })
    ).toThrow(/postgres:\/\/ or postgresql:\/\//);
  });

  it('recognises template passwords', () => {
    expect(isPlaceholderPassword('[YOUR-DATABASE-PASSWORD]')).toBe(true);
    expect(isPlaceholderPassword('REPLACE_ME')).toBe(true);
    expect(isPlaceholderPassword('a-real-password')).toBe(false);
  });
});

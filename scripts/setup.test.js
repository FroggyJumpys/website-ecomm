/**
 * Unit tests for `scripts/setup.mjs`, run with Node's built-in test runner:
 *
 *   npm run test:setup
 *
 * No dependency and no database are required, so these run before `npm install`
 * has necessarily finished.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  compareVersions,
  findPlaceholders,
  formatEnvValue,
  generateSecret,
  meetsMinimumVersion,
  parseArgs,
  parseSupabaseConnection,
  redactConnectionString,
  renderEnv,
  usesDevelopmentJwtSecret,
} from './setup.mjs';

const POOLER_URL =
  'postgresql://postgres.abcdefghijklmnop:s3cret-pass@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres';

/* parseArgs ----------------------------------------------------------------- */

test('parseArgs returns defaults and accepts `--name value`', () => {
  const defaults = parseArgs([]);
  assert.equal(defaults.provider, null);
  assert.equal(defaults.force, false);
  assert.equal(defaults.migrate, false);

  const options = parseArgs(['--provider', 'local', '--migrate', '--skip-install']);
  assert.equal(options.provider, 'local');
  assert.equal(options.migrate, true);
  assert.equal(options.skipInstall, true);
});

test('parseArgs accepts `--name=value` and kebab-case value options', () => {
  const options = parseArgs([
    '--supabase-url=postgres://user:pw@host:5432/postgres',
    '--test-database=ba_dekor_check',
    '--db-port=5433',
  ]);
  assert.equal(options.supabaseUrl, 'postgres://user:pw@host:5432/postgres');
  assert.equal(options.testDatabase, 'ba_dekor_check');
  assert.equal(options.dbPort, '5433');
});

test('parseArgs rejects unknown options, stray arguments and missing values', () => {
  assert.throws(() => parseArgs(['--nope']), /Unknown option: --nope/);
  assert.throws(() => parseArgs(['provider']), /Unexpected argument: provider/);
  assert.throws(() => parseArgs(['--provider']), /--provider needs a value/);
  assert.throws(() => parseArgs(['--force=yes']), /--force does not take a value/);
});

/* renderEnv ----------------------------------------------------------------- */

const EXAMPLE = [
  '# Sample env',
  'PORT=4000',
  '',
  '# DATABASE_PROVIDER=supabase',
  'DATABASE_PROVIDER=local',
  'DATABASE_URL=postgres://ba_dekor:ba_dekor@localhost:5432/ba_dekor',
  '# SUPABASE_POOLER_URL=postgresql://postgres.ref:REPLACE_ME@aws-1-region.pooler.supabase.com:5432/postgres',
  'JWT_SECRET=development-only-secret-change-me',
  'MIDTRANS_SERVER_KEY=SB-Mid-server-REPLACE_ME',
  '',
].join('\r\n');

test('renderEnv replaces managed values and keeps unrelated lines', () => {
  const output = renderEnv(EXAMPLE, {
    DATABASE_PROVIDER: 'supabase',
    JWT_SECRET: 'a'.repeat(64),
  });

  assert.match(output, /^DATABASE_PROVIDER=supabase$/m);
  assert.match(output, /^JWT_SECRET=a{64}$/m);
  assert.match(output, /^MIDTRANS_SERVER_KEY=SB-Mid-server-REPLACE_ME$/m);
  assert.match(output, /^PORT=4000$/m);
  assert.ok(!output.includes('\r'), 'line endings should be normalised to LF');
  assert.ok(output.endsWith('\n'));
});

test('renderEnv drops commented samples of managed keys and appends them once', () => {
  const output = renderEnv(EXAMPLE, {
    DATABASE_PROVIDER: 'supabase',
    SUPABASE_POOLER_URL: 'postgresql://postgres.ref:REPLACE_ME@host:5432/postgres',
    SUPABASE_DB_PASSWORD: 'pw',
    TEST_DATABASE_URL: 'postgresql://postgres.ref:REPLACE_ME@host:5432/ba_dekor_test',
  });

  assert.ok(!output.includes('# SUPABASE_POOLER_URL='), 'commented sample should be dropped');
  assert.equal((output.match(/^DATABASE_PROVIDER=/gm) ?? []).length, 1);
  assert.match(output, /^# --- Set by `npm run setup`/m);
  assert.match(
    output,
    /^SUPABASE_POOLER_URL=postgresql:\/\/postgres\.ref:REPLACE_ME@host:5432\/postgres$/m
  );
  assert.match(output, /^SUPABASE_DB_PASSWORD=pw$/m);
  assert.match(output, /^TEST_DATABASE_URL=/m);
});

test('renderEnv quotes values dotenv would otherwise misread', () => {
  const output = renderEnv('KEY=old\n', { KEY: 'pa#ss word' });
  assert.match(output, /^KEY="pa#ss word"$/m);
});

test('formatEnvValue only quotes when needed', () => {
  assert.equal(formatEnvValue('simple'), 'simple');
  assert.equal(formatEnvValue('has space'), '"has space"');
  assert.equal(formatEnvValue('hash#tag'), '"hash#tag"');
  assert.equal(formatEnvValue(''), '""');
  assert.equal(formatEnvValue('say "hi"'), '"say \\"hi\\""');
});

/* placeholders -------------------------------------------------------------- */

test('findPlaceholders reports only database keys with template values', () => {
  const text = [
    'DATABASE_PROVIDER=supabase',
    'SUPABASE_POOLER_URL=postgresql://postgres.ref:REPLACE_ME@host:5432/postgres',
    'SUPABASE_PASS=[YOUR-DATABASE-PASSWORD]',
    'MIDTRANS_SERVER_KEY=SB-Mid-server-REPLACE_ME',
    '# SUPABASE_CONN=postgresql://postgres:[YOUR-DATABASE-PASSWORD]@db.ref.supabase.co:5432/postgres',
    'JWT_SECRET=real-secret-value-that-is-long-enough',
  ].join('\n');

  assert.deepEqual(findPlaceholders(text), ['SUPABASE_POOLER_URL', 'SUPABASE_PASS']);
});

test('findPlaceholders accepts a REPLACE_ME URL when a real password is configured', () => {
  const text = [
    'DATABASE_PROVIDER=supabase',
    'SUPABASE_POOLER_URL=postgresql://postgres.ref:REPLACE_ME@aws-1-region.pooler.supabase.com:5432/postgres',
    'TEST_DATABASE_URL=postgresql://postgres.ref:REPLACE_ME@aws-1-region.pooler.supabase.com:5432/ba_dekor_test',
    'SUPABASE_PASS=real-secret-password',
  ].join('\n');

  assert.deepEqual(findPlaceholders(text), []);
});

test('findPlaceholders flags every database placeholder when no password exists', () => {
  const text = [
    'DATABASE_URL=postgres://ba_dekor:REPLACE_ME@localhost:5432/ba_dekor',
    'SUPABASE_POOLER_URL=postgresql://postgres.ref:REPLACE_ME@host:5432/postgres',
    'SUPABASE_PASS=REPLACE_ME',
  ].join('\n');

  assert.deepEqual(findPlaceholders(text), [
    'DATABASE_URL',
    'SUPABASE_POOLER_URL',
    'SUPABASE_PASS',
  ]);
});

test('usesDevelopmentJwtSecret detects the unmodified placeholder', () => {
  assert.equal(usesDevelopmentJwtSecret('JWT_SECRET=development-only-secret-change-me'), true);
  assert.equal(usesDevelopmentJwtSecret('JWT_SECRET="development-only-secret-change-me"'), true);
  assert.equal(usesDevelopmentJwtSecret(`JWT_SECRET=${'x'.repeat(64)}`), false);
  assert.equal(usesDevelopmentJwtSecret('# JWT_SECRET=development-only-secret-change-me'), false);
});

/* parseSupabaseConnection --------------------------------------------------- */

test('parseSupabaseConnection keeps the password out of the stored URL', () => {
  const connection = parseSupabaseConnection(POOLER_URL);

  assert.equal(connection.host, 'aws-1-ap-northeast-1.pooler.supabase.com');
  assert.equal(connection.isPooler, true);
  assert.equal(connection.isDirectHost, false);
  assert.equal(connection.database, 'postgres');
  assert.equal(connection.password, 's3cret-pass');
  assert.ok(connection.templateUrl.includes(':REPLACE_ME@'));
  assert.ok(!connection.templateUrl.includes('s3cret-pass'));
  assert.ok(connection.testUrl.endsWith(':5432/ba_dekor_test'));
});

test('parseSupabaseConnection keeps the port and strips sslmode', () => {
  const connection = parseSupabaseConnection(`${POOLER_URL}?sslmode=require`, {
    testDatabase: 'ba_dekor_check',
  });

  assert.ok(!connection.templateUrl.includes('sslmode'));
  assert.ok(connection.templateUrl.includes(':5432/'));
  assert.ok(connection.testUrl.endsWith('/ba_dekor_check'));
});

test('parseSupabaseConnection returns no password for a placeholder URL', () => {
  const connection = parseSupabaseConnection(
    'postgresql://postgres.ref:[YOUR-DATABASE-PASSWORD]@db.ref.supabase.co:5432/postgres'
  );

  assert.equal(connection.password, null);
  assert.equal(connection.isDirectHost, true);
  assert.equal(connection.isPooler, false);
});

test('parseSupabaseConnection rejects non-PostgreSQL and malformed input', () => {
  assert.throws(() => parseSupabaseConnection(''), /connection string is required/);
  assert.throws(() => parseSupabaseConnection('not a url'), /not a valid URL/);
  assert.throws(() => parseSupabaseConnection('mysql://user@host:3306/db'), /postgres:\/\//);
  assert.throws(
    () => parseSupabaseConnection(POOLER_URL, { testDatabase: 'bad name!' }),
    /identifier/
  );
});

test('parseSupabaseConnection explains percent-encoding for unescaped passwords', () => {
  assert.throws(
    () => parseSupabaseConnection('postgresql://postgres.ref:Fake#Pass1@host:5432/postgres'),
    /percent-encoded/
  );
  assert.throws(() => parseSupabaseConnection('postgresql:///postgres'), /no host/);

  const encoded = parseSupabaseConnection(
    'postgresql://postgres.ref:Fake%23Pass1@aws-1-region.pooler.supabase.com:5432/postgres'
  );
  assert.equal(encoded.password, 'Fake#Pass1');
  assert.ok(encoded.templateUrl.includes(':REPLACE_ME@'));
});

/* redaction ----------------------------------------------------------------- */

test('redactConnectionString hides the password and survives bad input', () => {
  const redacted = redactConnectionString(POOLER_URL);
  assert.ok(!redacted.includes('s3cret-pass'));
  assert.ok(redacted.includes('***'));
  assert.equal(redactConnectionString('nonsense'), '(invalid URL)');
});

/* versions ------------------------------------------------------------------ */

test('compareVersions and meetsMinimumVersion compare numerically', () => {
  assert.equal(compareVersions('22.14.0', '22.12'), 1);
  assert.equal(compareVersions('22.12', '22.12.0'), 0);
  assert.equal(compareVersions('20.9.0', '22.12'), -1);
  assert.equal(compareVersions('9.0.0', '10.0.0'), -1);

  assert.equal(meetsMinimumVersion('22.14.0', '22.12'), true);
  assert.equal(meetsMinimumVersion('22.11.0', '22.12'), false);
});

/* secrets ------------------------------------------------------------------- */

test('generateSecret produces a long, URL-safe, unique secret', () => {
  const first = generateSecret();
  const second = generateSecret();

  assert.ok(first.length >= 24);
  assert.match(first, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(first, second);
});

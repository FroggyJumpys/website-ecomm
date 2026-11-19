#!/usr/bin/env node
/**
 * One-command local setup for a fresh clone of BaDekor.
 *
 * Run with `npm run setup` (or `node scripts/setup.mjs`). The script:
 *
 *  1. checks the Node.js version against `engines.node` in package.json,
 *  2. installs the npm workspaces (`npm install`),
 *  3. creates the runtime directories that git does not track,
 *  4. writes the git-ignored `server/.env` from `server/.env.example`, filling in
 *     a generated `JWT_SECRET` and the database connection (Supabase by
 *     default, local PostgreSQL/Docker on request),
 *  5. optionally applies migrations and seed data (`--migrate`).
 *
 * It never overwrites an existing `server/.env` unless `--force` is passed, so
 * re-running it after pulling changes is safe.
 *
 * Only the pure helpers are exported; importing this module has no side effects.
 */

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
export const ENV_EXAMPLE_PATH = path.join(REPO_ROOT, 'server', '.env.example');
export const ENV_PATH = path.join(REPO_ROOT, 'server', '.env');
export const ROOT_ENV_PATH = path.join(REPO_ROOT, '.env');
export const UPLOAD_DIR = path.join(REPO_ROOT, 'server', 'uploads', 'catalog');

export const LOCAL_DATABASE_URL = 'postgres://ba_dekor:ba_dekor@localhost:5432/ba_dekor';
export const DEFAULT_TEST_DATABASE = 'ba_dekor_test';
/**
 * The placeholder shipped in `server/.env.example` and the fallback in
 * `server/src/config/env.js`. Both must stay in sync.
 */
export const JWT_PLACEHOLDER = 'development-only-secret-change-me';
export const MIN_JWT_SECRET_LENGTH = 24;

/** Keys whose leftover placeholders block migrations. Midtrans keys are optional. */
export const DATABASE_KEYS = [
  'DATABASE_PROVIDER',
  'DATABASE_URL',
  'SUPABASE_POOLER_URL',
  'SUPABASE_CONN',
  'SUPABASE_DB_PASSWORD',
  'SUPABASE_PASS',
  'TEST_DATABASE_URL',
];

const PLACEHOLDER_VALUE = /REPLACE_ME|\[YOUR-DATABASE-PASSWORD\]|CHANGEME/i;
/** Keys the runtime reads the password from when a URL still has a placeholder. */
export const PASSWORD_SUBSTITUTION_KEYS = ['SUPABASE_DB_PASSWORD', 'SUPABASE_PASS'];
/** Keys whose `REPLACE_ME` password is filled in at runtime. */
export const CONNECTION_URL_KEYS = ['SUPABASE_POOLER_URL', 'SUPABASE_CONN', 'TEST_DATABASE_URL'];
const ENCODING_HINT =
  'Special characters in the password must be percent-encoded: # becomes %23, @ becomes %40, / becomes %2F.';
const PLACEHOLDER_PASSWORD = /^(?:\[?your-database-password\]?|replace[_-]?me|changeme)$/i;

const VALUE_OPTIONS = {
  provider: 'provider',
  'supabase-url': 'supabaseUrl',
  'supabase-password': 'supabasePassword',
  'test-database': 'testDatabase',
  'database-url': 'databaseUrl',
  'db-port': 'dbPort',
};

const BOOLEAN_OPTIONS = {
  force: 'force',
  'skip-install': 'skipInstall',
  migrate: 'migrate',
  help: 'help',
};

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Parses `--name value` and `--name=value` pairs. Unknown options and missing
 * values throw, so a typo fails loudly instead of being silently ignored.
 */
export function parseArgs(argv = []) {
  const options = {
    provider: null,
    supabaseUrl: null,
    supabasePassword: null,
    testDatabase: null,
    databaseUrl: null,
    dbPort: null,
    force: false,
    skipInstall: false,
    migrate: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) {
      throw new Error(`Unexpected argument: ${argument}`);
    }

    let name = argument.slice(2);
    let value;
    const equals = name.indexOf('=');
    if (equals !== -1) {
      value = name.slice(equals + 1);
      name = name.slice(0, equals);
    }

    if (Object.hasOwn(BOOLEAN_OPTIONS, name)) {
      if (value !== undefined) {
        throw new Error(`--${name} does not take a value.`);
      }
      options[BOOLEAN_OPTIONS[name]] = true;
      continue;
    }

    if (Object.hasOwn(VALUE_OPTIONS, name)) {
      if (value === undefined) {
        index += 1;
        value = argv[index];
      }
      if (value === undefined || value === '') {
        throw new Error(`--${name} needs a value.`);
      }
      options[VALUE_OPTIONS[name]] = value;
      continue;
    }

    throw new Error(`Unknown option: --${name}`);
  }

  return options;
}

export function generateSecret() {
  return randomBytes(48).toString('base64url');
}

/** Quotes a value only when dotenv would otherwise misread it. */
export function formatEnvValue(value) {
  const text = String(value);
  if (text === '') return '""';
  if (!/[\s#"']/.test(text)) return text;
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Turns `server/.env.example` into `server/.env`.
 *
 * Uncommented lines for managed keys get their value replaced; commented
 * samples of those keys are dropped so there is exactly one source of truth
 * (the generated block at the end of the file). Comments and unrelated keys
 * are preserved verbatim and line endings are normalised to LF.
 */
export function renderEnv(example, overrides) {
  const managed = new Set(Object.keys(overrides));
  const lines = String(example).replace(/\r\n?/g, '\n').split('\n');
  const output = [];
  const applied = new Set();

  for (const line of lines) {
    const match = /^\s*(#\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (!match || !managed.has(match[2])) {
      output.push(line);
      continue;
    }
    if (match[1]) continue; // commented sample, emitted in the generated block
    output.push(`${match[2]}=${formatEnvValue(overrides[match[2]])}`);
    applied.add(match[2]);
  }

  const missing = [...managed].filter((key) => !applied.has(key)).sort();
  if (missing.length > 0) {
    while (output.length > 0 && output[output.length - 1].trim() === '') output.pop();
    output.push('');
    output.push('# --- Set by `npm run setup` ---------------------------------------------------');
    output.push('# The runtime replaces the REPLACE_ME password from SUPABASE_DB_PASSWORD, so');
    output.push('# the secret is stored once instead of in every connection string.');
    for (const key of missing) {
      output.push(`${key}=${formatEnvValue(overrides[key])}`);
    }
    output.push('');
  }

  const text = output
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+$/, '');

  return `${text}\n`;
}

/**
 * Returns the database keys in `text` whose value is still a placeholder.
 *
 * A `REPLACE_ME` password inside a Supabase connection URL is intentional: the
 * runtime substitutes it from `SUPABASE_DB_PASSWORD`/`SUPABASE_PASS`. Those URLs
 * are only reported when no real password is configured at all, because then the
 * API cannot connect.
 */
export function findPlaceholders(text, keys = DATABASE_KEYS) {
  const values = new Map();
  for (const line of String(text).replace(/\r\n?/g, '\n').split('\n')) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match || !keys.includes(match[1])) continue;
    values.set(match[1], match[2].trim());
  }

  const hasRealPassword = PASSWORD_SUBSTITUTION_KEYS.some((key) => {
    const value = values.get(key);
    return Boolean(value) && !PLACEHOLDER_VALUE.test(value);
  });

  const found = [];
  for (const [key, value] of values) {
    if (!PLACEHOLDER_VALUE.test(value)) continue;
    if (hasRealPassword && CONNECTION_URL_KEYS.includes(key)) continue;
    found.push(key);
  }
  return found;
}

/** True when `text` still sets the development-only session secret. */
export function usesDevelopmentJwtSecret(text) {
  for (const line of String(text).replace(/\r\n?/g, '\n').split('\n')) {
    const match = /^\s*JWT_SECRET\s*=\s*(.*)$/.exec(line);
    if (match && match[1].trim().replace(/^"|"$/g, '') === JWT_PLACEHOLDER) return true;
  }
  return false;
}

/**
 * Splits a Supabase connection string into the parts the API expects: a URL
 * with a `REPLACE_ME` password (stored in the committed example and in `.env`),
 * the password itself (stored once in `SUPABASE_DB_PASSWORD`), and the matching
 * test-database URL.
 */
export function parseSupabaseConnection(raw, { testDatabase = DEFAULT_TEST_DATABASE } = {}) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) throw new Error('A Supabase connection string is required.');

  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`The Supabase connection string is not a valid URL. ${ENCODING_HINT}`);
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('The Supabase connection string must start with postgres:// or postgresql://.');
  }
  if (!url.hostname) {
    throw new Error(`The Supabase connection string has no host. ${ENCODING_HINT}`);
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(testDatabase)) {
    throw new Error('The test database name must be a plain PostgreSQL identifier.');
  }

  const decodedPassword = url.password ? decodeURIComponent(url.password) : '';
  const password =
    decodedPassword && !PLACEHOLDER_PASSWORD.test(decodedPassword) ? decodedPassword : null;

  const templateUrl = new URL(url.toString());
  templateUrl.password = 'REPLACE_ME';
  // `pg` reads `sslmode=require` as verify-full, which rejects Supabase's
  // pooler chain; the API passes explicit SSL options instead.
  templateUrl.searchParams.delete('sslmode');
  templateUrl.searchParams.delete('uselibpqcompat');

  const testUrl = new URL(templateUrl.toString());
  testUrl.pathname = `/${testDatabase}`;

  const host = url.hostname.toLowerCase();

  return {
    host,
    isPooler: host.endsWith('.pooler.supabase.com'),
    isDirectHost: /^db\.[a-z0-9]+\.supabase\.co$/.test(host),
    projectRef: url.username || null,
    database: decodeURIComponent(url.pathname.replace(/^\//, '')) || 'postgres',
    password,
    templateUrl: templateUrl.toString(),
    testUrl: testUrl.toString(),
  };
}

/** Hides the password so a connection string can be printed safely. */
export function redactConnectionString(raw) {
  try {
    const url = new URL(String(raw));
    if (url.password) url.password = '***';
    return url.toString();
  } catch {
    return '(invalid URL)';
  }
}

function parseVersionParts(version) {
  return String(version)
    .split(/[.+-]/)
    .filter((part) => part !== '')
    .map((part) => {
      const value = Number.parseInt(part, 10);
      return Number.isNaN(value) ? 0 : value;
    });
}

export function compareVersions(left, right) {
  const a = parseVersionParts(left);
  const b = parseVersionParts(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const x = a[index] ?? 0;
    const y = b[index] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export function meetsMinimumVersion(actual, minimum) {
  return compareVersions(actual, minimum) >= 0;
}

/* -------------------------------------------------------------------------- */
/* Terminal helpers                                                           */
/* -------------------------------------------------------------------------- */

const step = (message) => console.log(`\n> ${message}`);
const info = (message) => console.log(`  ${message}`);
const warn = (message) => console.warn(`  ! ${message}`);

function runCommand(command, args, label) {
  step(label);
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    // npm is a .cmd shim on Windows and only resolves through a shell.
    shell: process.platform === 'win32',
  });
  if (result.error) {
    throw new Error(`${label} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}.`);
  }
}

function createPrompter() {
  if (!process.stdin.isTTY) return null;
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

async function ask(prompter, question, { defaultValue = null } = {}) {
  if (!prompter) return defaultValue ?? '';
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  const answer = (await prompter.question(`${question}${suffix}: `)).trim();
  return answer || (defaultValue ?? '');
}

/* -------------------------------------------------------------------------- */
/* Setup steps                                                                */
/* -------------------------------------------------------------------------- */

async function readMinimumNodeVersion() {
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    const match = /(\d+\.\d+(?:\.\d+)?)/.exec(pkg.engines?.node ?? '');
    return match ? match[1] : '22.12';
  } catch {
    return '22.12';
  }
}

async function resolveProvider(options, prompter) {
  const provider = options.provider ?? process.env.DATABASE_PROVIDER ?? null;
  if (provider) {
    if (provider !== 'supabase' && provider !== 'local') {
      throw new Error('--provider must be either "supabase" or "local".');
    }
    return provider;
  }

  const answer = await ask(prompter, 'Database provider (supabase or local)', {
    defaultValue: 'supabase',
  });
  if (answer !== 'supabase' && answer !== 'local') {
    throw new Error(
      'A database provider is required. Pass --provider=supabase (default) or --provider=local.'
    );
  }
  return answer;
}

async function configureSupabase(options, prompter, overrides) {
  const suppliedUrl =
    options.supabaseUrl ?? process.env.SUPABASE_POOLER_URL ?? process.env.SUPABASE_CONN ?? '';
  const urlAnswer =
    suppliedUrl ||
    (await ask(prompter, 'Supabase session-pooler connection string (Connect > Session pooler)'));

  if (!urlAnswer) {
    throw new Error(
      'A Supabase connection string is required. Pass --supabase-url, export SUPABASE_POOLER_URL, or run the script in an interactive terminal.'
    );
  }

  const testDatabase = options.testDatabase ?? DEFAULT_TEST_DATABASE;
  const connection = parseSupabaseConnection(urlAnswer, { testDatabase });

  const password =
    options.supabasePassword ??
    process.env.SUPABASE_DB_PASSWORD ??
    process.env.SUPABASE_PASS ??
    connection.password ??
    (await ask(prompter, 'Supabase database password'));

  if (!password) {
    throw new Error(
      'A Supabase database password is required. Pass --supabase-password, export SUPABASE_DB_PASSWORD, or include the password in the connection string.'
    );
  }

  if (connection.isDirectHost) {
    warn('That is the direct db.<ref>.supabase.co host, which is IPv6-only on free projects.');
    warn('Use the session-pooler host (aws-<n>-<region>.pooler.supabase.com) on IPv4 networks.');
  } else if (!connection.isPooler && !connection.host.endsWith('.supabase.co')) {
    warn(`Unrecognised host "${connection.host}"; continuing anyway.`);
  }

  overrides.DATABASE_PROVIDER = 'supabase';
  overrides.SUPABASE_POOLER_URL = connection.templateUrl;
  overrides.SUPABASE_DB_PASSWORD = password;
  overrides.TEST_DATABASE_URL = connection.testUrl;

  return { provider: 'supabase', host: connection.host, testDatabase };
}

async function configureLocal(options, prompter, overrides) {
  const suppliedUrl = options.databaseUrl ?? process.env.DATABASE_URL ?? '';
  const answer =
    suppliedUrl ||
    (await ask(prompter, 'PostgreSQL connection URL', { defaultValue: LOCAL_DATABASE_URL }));
  const raw = answer || LOCAL_DATABASE_URL;

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`The PostgreSQL connection URL is not a valid URL. ${ENCODING_HINT}`);
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('The PostgreSQL connection URL must start with postgres:// or postgresql://.');
  }
  if (!url.hostname) {
    throw new Error(`The PostgreSQL connection URL has no host. ${ENCODING_HINT}`);
  }

  if (options.dbPort) {
    const port = String(options.dbPort);
    if (!/^\d+$/.test(port)) throw new Error('--db-port must be a port number.');
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      url.port = port;
    } else {
      warn(`Not changing the port of a non-local host (${url.hostname}); set it by hand.`);
    }
    await writeRootEnvPort(port);
    info(`Root .env keeps DB_PORT=${port} for docker-compose.`);
  }

  overrides.DATABASE_PROVIDER = 'local';
  overrides.DATABASE_URL = url.toString();

  return { provider: 'local', host: url.hostname, testDatabase: null };
}

/** Creates or updates the root `.env` (docker-compose port override only). */
async function writeRootEnvPort(port) {
  const existing = existsSync(ROOT_ENV_PATH) ? await fs.readFile(ROOT_ENV_PATH, 'utf8') : '';
  const lines = existing
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => !/^\s*DB_PORT\s*=/.test(line));

  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  if (lines.length === 0) {
    lines.push('# Machine-local overrides for docker compose. Git-ignored; do not commit.');
    lines.push('# Publish the database container on DB_PORT instead of 5432.');
  }
  lines.push(`DB_PORT=${port}`);

  await fs.writeFile(ROOT_ENV_PATH, `${lines.join('\n')}\n`, { encoding: 'utf8' });
}

async function configureEnvironment(options, prompter) {
  if (existsSync(ENV_PATH) && !options.force) {
    info('server/.env already exists; leaving it untouched (use --force to regenerate).');
    const existing = await fs.readFile(ENV_PATH, 'utf8');
    const placeholders = findPlaceholders(existing);
    if (placeholders.length > 0) {
      warn(`server/.env still contains placeholders: ${placeholders.join(', ')}`);
    }
    if (usesDevelopmentJwtSecret(existing)) {
      warn(
        'server/.env still uses the development JWT_SECRET; a production build will refuse to boot. `--force` generates a random one.'
      );
    }
    return { created: false, provider: null, host: null, testDatabase: null, placeholders };
  }

  const example = await fs.readFile(ENV_EXAMPLE_PATH, 'utf8');
  const provider = await resolveProvider(options, prompter);
  const overrides = { JWT_SECRET: generateSecret() };

  const details =
    provider === 'supabase'
      ? await configureSupabase(options, prompter, overrides)
      : await configureLocal(options, prompter, overrides);

  const content = renderEnv(example, overrides);
  await fs.writeFile(ENV_PATH, content, { encoding: 'utf8', mode: 0o600 });

  info('server/.env written (git-ignored).');
  info(`Database provider: ${details.provider}`);
  if (overrides.SUPABASE_POOLER_URL) {
    info(`Supabase host: ${details.host}`);
    info(`Connection: ${redactConnectionString(overrides.SUPABASE_POOLER_URL)}`);
  } else {
    info(`Connection: ${redactConnectionString(overrides.DATABASE_URL)}`);
  }
  info(`JWT_SECRET: generated (${MIN_JWT_SECRET_LENGTH}+ characters required).`);

  const placeholders = findPlaceholders(content);
  return { created: true, ...details, placeholders };
}

function printNextSteps(outcome, options) {
  const created = outcome?.created ?? false;
  const provider = outcome?.provider ?? null;

  if (!created && outcome?.placeholders?.length > 0) {
    warn('Fill in the placeholders above before starting the API.');
  }

  if (!options.migrate) {
    console.log('\nNext steps:');
    console.log('  npm run db:migrate   # create the schema');
    console.log('  npm run db:seed      # catalogue, demo accounts, sample orders');
    console.log('  npm run dev          # http://localhost:5173 (API on :4000)');
  } else {
    console.log('\nStart the app with: npm run dev');
    console.log('  web  http://localhost:5173');
    console.log('  api  http://localhost:4000/api/v1/health');
  }

  if (provider === 'supabase') {
    console.log('\nSupabase reminder: the test database is separate from the app database.');
    console.log(`  Create it once in the SQL editor: CREATE DATABASE ${outcome.testDatabase};`);
  }
  if (provider === 'local' && !options.migrate) {
    console.log('\nLocal PostgreSQL: start Docker with `docker compose up -d db`');
    console.log('if you do not already run PostgreSQL on the configured port.');
  }
}

function printHelp() {
  console.log(`BaDekor setup — installs dependencies, creates runtime folders and writes .env files.

Usage: npm run setup [-- options]

Options:
  --provider <supabase|local>  Database backend to configure (default: supabase).
  --supabase-url <url>         Session-pooler connection string. Falls back to
                               SUPABASE_POOLER_URL / SUPABASE_CONN.
  --supabase-password <pass>   Database password. Falls back to SUPABASE_DB_PASSWORD /
                               SUPABASE_PASS, then to the password inside the URL.
  --test-database <name>       Test database name (default: ${DEFAULT_TEST_DATABASE}).
  --database-url <url>         Connection string for --provider local.
  --db-port <port>             Local mode: also write DB_PORT into the root .env so
                               docker compose publishes the database on that port.
  --force                      Regenerate server/.env even if it already exists.
  --skip-install               Do not run npm install.
  --migrate                    Run db:migrate and db:seed after writing the env.
  --help                       Show this message.

Examples:
  npm run setup
  npm run setup -- --provider local --db-port 5433
  npm run setup -- --migrate`);
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  step('BaDekor setup');
  info(`Repository: ${REPO_ROOT}`);

  const minimumNode = await readMinimumNodeVersion();
  if (!meetsMinimumVersion(process.versions.node, minimumNode)) {
    throw new Error(
      `Node.js ${minimumNode} or newer is required, but this shell runs ${process.versions.node}.`
    );
  }
  info(`Node.js ${process.versions.node} (minimum ${minimumNode})`);

  if (options.skipInstall) {
    info('Dependencies: skipped (--skip-install).');
  } else {
    runCommand('npm', ['install'], 'Installing workspace dependencies');
  }

  step('Creating runtime directories');
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  info('server/uploads/catalog/');

  step('Writing environment files');
  const prompter = createPrompter();
  let outcome;
  try {
    outcome = await configureEnvironment(options, prompter);
  } finally {
    prompter?.close();
  }

  if (options.migrate) {
    if (outcome.placeholders.length > 0) {
      throw new Error(
        `server/.env still contains placeholders (${outcome.placeholders.join(', ')}); migrations need a real connection.`
      );
    }
    runCommand('npm', ['run', 'db:migrate'], 'Applying migrations');
    runCommand('npm', ['run', 'db:seed'], 'Loading seed data');
  }

  printNextSteps(outcome, options);
}

function isEntryPoint() {
  if (!process.argv[1]) return false;
  const entry = path.resolve(process.argv[1]);
  const self = path.resolve(fileURLToPath(import.meta.url));
  return process.platform === 'win32' ? entry.toLowerCase() === self.toLowerCase() : entry === self;
}

if (isEntryPoint()) {
  main().catch((error) => {
    console.error(`\nSetup failed: ${error.message}`);
    process.exitCode = 1;
  });
}

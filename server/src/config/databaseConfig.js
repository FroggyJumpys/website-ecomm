/**
 * Database connection resolution.
 *
 * `DATABASE_PROVIDER=local` keeps the old behaviour: `DATABASE_URL` points at
 * the Docker/local PostgreSQL instance. `DATABASE_PROVIDER=supabase` builds the
 * runtime connection from the Supabase connection settings instead.
 *
 * Supabase's direct host (`db.<ref>.supabase.co`) is IPv6-only. The pooler host
 * (`aws-<n>-<region>.pooler.supabase.com`) is reachable over IPv4 and is what
 * `SUPABASE_POOLER_URL` should contain. `SUPABASE_CONN` is still accepted as a
 * fallback for networks that can reach the direct IPv6 host.
 */

export const DEFAULT_DATABASE_URL = 'postgres://ba_dekor:ba_dekor@localhost:5432/ba_dekor';

const PLACEHOLDER_PASSWORD = /^(?:\[?your-database-password\]?|replace[_-]?me|changeme)?$/i;

function decodePassword(value) {
  try {
    return decodeURIComponent(value ?? '');
  } catch {
    return value ?? '';
  }
}

export function isPlaceholderPassword(value) {
  return PLACEHOLDER_PASSWORD.test(decodePassword(value).trim());
}

/**
 * Parses a PostgreSQL URL, substituting the real password when the value still
 * contains a template placeholder such as `[YOUR-DATABASE-PASSWORD]`.
 *
 * The returned URL never gets logged by this module. Callers should keep it
 * server-side.
 */
export function parseDatabaseUrl(raw, { password, label = 'DATABASE_URL' } = {}) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error(`${label} is required.`);
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} must be a valid PostgreSQL connection URL.`);
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error(`${label} must use the postgres:// or postgresql:// scheme.`);
  }

  if (isPlaceholderPassword(url.password)) {
    if (!password) {
      throw new Error(
        `${label} still contains a placeholder password; set SUPABASE_DB_PASSWORD or SUPABASE_PASS.`
      );
    }
    url.password = password;
  }

  return url;
}

/**
 * `pg` treats `sslmode=require` as `verify-full` since v8, which rejects the
 * pooler's certificate chain on machines that do not have Supabase's CA loaded.
 * We strip the parameter and pass an explicit `ssl` option instead.
 *
 * Verification is disabled by default for Supabase because its pooler chain is
 * not in Node's default trust store. `DATABASE_SSL_REJECT_UNAUTHORIZED=true`
 * re-enables it for deployments that install the CA.
 */
export function resolveSsl(url, { provider, forceSsl, rejectUnauthorized = false } = {}) {
  const sslMode = url.searchParams.get('sslmode');
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');

  if (forceSsl === false || sslMode === 'disable') return null;

  const enabled = forceSsl === true || provider === 'supabase' || Boolean(sslMode);

  return enabled ? { rejectUnauthorized } : null;
}

/**
 * Resolves the connection string and SSL mode from parsed environment values.
 * Returns a fresh URL so the caller cannot accidentally mutate the source.
 */
export function resolveDatabaseConfig(source) {
  const provider = source.DATABASE_PROVIDER === 'supabase' ? 'supabase' : 'local';
  const supabasePassword = source.SUPABASE_DB_PASSWORD ?? source.SUPABASE_PASS;

  const raw =
    provider === 'supabase'
      ? (source.SUPABASE_POOLER_URL ?? source.SUPABASE_CONN)
      : (source.DATABASE_URL ?? DEFAULT_DATABASE_URL);

  if (provider === 'supabase' && !raw) {
    throw new Error('DATABASE_PROVIDER=supabase requires SUPABASE_POOLER_URL or SUPABASE_CONN.');
  }

  const url = parseDatabaseUrl(raw, {
    password: provider === 'supabase' ? supabasePassword : undefined,
    label: provider === 'supabase' ? 'Supabase connection' : 'DATABASE_URL',
  });

  const ssl = resolveSsl(url, {
    provider,
    forceSsl: source.DATABASE_SSL,
    rejectUnauthorized: source.DATABASE_SSL_REJECT_UNAUTHORIZED ?? false,
  });

  return {
    provider,
    url: url.toString(),
    ssl,
  };
}

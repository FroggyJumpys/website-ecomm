/**
 * Resolves the connection string the integration tests run against.
 *
 * Tests truncate tables, so pointing them at the development database would
 * destroy the seeded demo data. Every resolved URL must therefore name a
 * database whose name ends in `_test`; anything else is refused before a
 * connection is opened.
 *
 * Default behaviour: take the development URL from `DATABASE_URL` and swap the
 * database name for `<name>_test`, so a fresh checkout needs no extra setup.
 * `TEST_DATABASE_URL` overrides it, but only with another `_test` database.
 */
export function resolveTestDatabaseUrl(databaseUrl, overrideUrl) {
  const url = new URL(overrideUrl || databaseUrl);

  if (!overrideUrl) {
    url.pathname = `${url.pathname.replace(/\/$/, '')}_test`;
  }

  const databaseName = url.pathname.replace(/^\//, '');

  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing to run integration tests against "${databaseName || '(no database)'}": ` +
        'the database name must end in "_test".'
    );
  }

  return url.toString();
}

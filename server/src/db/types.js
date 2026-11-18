import pg from 'pg';

/**
 * `pg` returns BIGINT (OID 20) as a string to protect values beyond
 * `Number.MAX_SAFE_INTEGER`. Every id in this schema is an identity column far
 * below that bound, and the client compares `user.id` numerically, so the API
 * boundary converts BIGINT to a number once, here, instead of in every query.
 */
pg.types.setTypeParser(20, (value) => (value === null ? null : Number(value)));

export const { Pool, Client } = pg;
export default pg;

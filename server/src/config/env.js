import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().default('postgres://ba_dekor:ba_dekor@localhost:5432/ba_dekor'),
  JWT_SECRET: z.string().min(24).default('development-only-secret-change-me'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  COOKIE_NAME: z.string().default('ba_dekor_session'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),

  /**
   * Where uploaded catalogue images are written. Relative paths resolve from
   * the server package directory, so the default `uploads/catalog` is
   * `server/uploads/catalog`. In a container this must be a mounted volume, or
   * every deployed image disappears with the previous container.
   */
  UPLOAD_DIR: z.string().optional(),

  /**
   * The directory the seeded `/images/...` paths come from — the client's
   * `public/images` in development, `dist/images` in a production build. Only
   * read to check that a product's image path really exists.
   */
  PUBLIC_IMAGE_DIR: z.string().optional(),

  /**
   * Midtrans Snap. The server key signs transactions and verifies webhooks; the
   * client key is public and is handed to the browser so the Snap popup can
   * open. Both are optional so the rest of the API still boots without payment
   * credentials: the payment endpoints answer `503 PAYMENT_NOT_CONFIGURED`
   * instead of failing at startup.
   *
   * The `MT_*` aliases are accepted because an existing local `.env` may use
   * them; `MIDTRANS_*` stays the documented name.
   */
  MIDTRANS_SERVER_KEY: z.string().min(1).optional(),
  MIDTRANS_CLIENT_KEY: z.string().min(1).optional(),
  MIDTRANS_MERCHANT_ID: z.string().min(1).optional(),
  MIDTRANS_IS_PRODUCTION: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  /**
   * Where the Snap popup script is loaded from. Derived from the mode when
   * unset; overridable so a proxy or an offline test can point elsewhere.
   */
  MIDTRANS_SNAP_SCRIPT_URL: z.string().url().optional(),
  /** How long a Snap transaction stays payable, in minutes. */
  MIDTRANS_EXPIRY_MINUTES: z.coerce.number().int().min(1).max(24 * 60).default(120),
});

/**
 * Copies the legacy `MT_*` aliases onto the documented `MIDTRANS_*` names.
 * Explicit `MIDTRANS_*` values always win.
 */
function withMidtransAliases(source) {
  return {
    ...source,
    MIDTRANS_SERVER_KEY: source.MIDTRANS_SERVER_KEY ?? source.MT_SERVER_KEY,
    MIDTRANS_CLIENT_KEY: source.MIDTRANS_CLIENT_KEY ?? source.MT_CLIENT_KEY,
    MIDTRANS_MERCHANT_ID: source.MIDTRANS_MERCHANT_ID ?? source.MT_MERCHANT_ID,
  };
}

const result = schema.safeParse(withMidtransAliases(process.env));

if (!result.success) {
  console.error('Invalid environment configuration:');
  for (const issue of result.error.issues) {
    console.error(`  ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = result.data;

if (env.NODE_ENV === 'production' && env.JWT_SECRET.startsWith('development-only')) {
  console.error('JWT_SECRET must be set to a real secret in production.');
  process.exit(1);
}

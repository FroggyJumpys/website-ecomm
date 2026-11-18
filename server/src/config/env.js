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
});

const result = schema.safeParse(process.env);

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

import { z } from 'zod';

/**
 * Request schemas for the auth endpoints. They validate *and* normalise, so
 * the service receives clean values: emails lowercased, phone numbers in the
 * local `08…` form, names trimmed. Messages are Bahasa Indonesia because they
 * can reach the browser; codes and field names stay English.
 *
 * Passwords are never trimmed: leading or trailing spaces are part of what the
 * user typed, and bcrypt hashes exactly those bytes.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^08[1-9][0-9]{6,10}$/;

/** Accepts 0812…, 62812… and +62812…, and returns the local 08… form. */
function normalizePhone(value) {
  const digits = value.replace(/[\s().-]/g, '');

  if (digits.startsWith('+62')) return `0${digits.slice(3)}`;
  if (digits.startsWith('62')) return `0${digits.slice(2)}`;

  return digits;
}

const nameSchema = z
  .string({ error: 'Nama lengkap wajib diisi.' })
  .trim()
  .min(2, 'Nama minimal 2 karakter.')
  .max(80, 'Nama maksimal 80 karakter.');

const emailSchema = z
  .string({ error: 'Email wajib diisi.' })
  .trim()
  .toLowerCase()
  .max(254, 'Email maksimal 254 karakter.')
  .regex(EMAIL_PATTERN, 'Format email belum benar. Contoh: nama@email.com');

const phoneSchema = z
  .string({ error: 'Nomor WhatsApp wajib diisi.' })
  .trim()
  .transform(normalizePhone)
  .refine((phone) => PHONE_PATTERN.test(phone), {
    message: 'Nomor WhatsApp belum benar. Contoh: 0812 3456 7890',
  });

/**
 * bcrypt silently ignores everything past 72 bytes, so a longer password would
 * be accepted by the form and then truncated by the hash. Reject it instead;
 * the limit is in bytes because an emoji costs four of them.
 */
const passwordSchema = z
  .string({ error: 'Kata sandi wajib diisi.' })
  .min(PASSWORD_MIN_LENGTH, 'Kata sandi minimal 8 karakter.')
  .refine((password) => Buffer.byteLength(password, 'utf8') <= PASSWORD_MAX_BYTES, {
    message: 'Kata sandi maksimal 72 karakter.',
  })
  .refine((password) => /[a-zA-Z]/.test(password) && /[0-9]/.test(password), {
    message: 'Gabungkan huruf dan angka agar kata sandi lebih kuat.',
  });

/**
 * Strict objects: an unexpected key (for example `role: "admin"`) is rejected
 * rather than ignored, so privilege escalation is a validation error and not a
 * silently dropped field.
 */
export const registerSchema = z.strictObject({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
});

/**
 * Login only checks that a password was supplied. The strength rules apply to
 * new passwords; an account created before those rules existed can still sign
 * in.
 */
export const loginSchema = z.strictObject({
  email: emailSchema,
  password: z.string({ error: 'Kata sandi wajib diisi.' }).min(1, 'Kata sandi wajib diisi.'),
});

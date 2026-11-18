import { z } from 'zod';

/**
 * Auth request schemas. Every message is user-facing, so it is Bahasa
 * Indonesia; the field rules mirror `client/src/lib/validation.js` so the form
 * and the API reject the same input.
 */

export const PASSWORD_MIN_LENGTH = 8;

// bcrypt only hashes the first 72 *bytes* of a password, so a 38-character
// password full of multi-byte letters would be silently truncated. Byte length,
// not character length, is the limit that matters.
export const PASSWORD_MAX_BYTES = 72;

const NAME_MAX_LENGTH = 80;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^08[1-9][0-9]{6,10}$/;

const EMAIL_MESSAGE = 'Format email belum benar. Contoh: nama@email.com';
const PHONE_MESSAGE = 'Nomor WhatsApp belum benar. Contoh: 0812 3456 7890';

/** Accepts 0812…, 62812… and +62812…, and returns the local 08… form. */
export function normalizePhone(value) {
  const digits = String(value ?? '').replace(/[\s().-]/g, '');

  if (digits.startsWith('+62')) return `0${digits.slice(3)}`;
  if (digits.startsWith('62')) return `0${digits.slice(2)}`;

  return digits;
}

export const phoneSchema = z
  .string({ error: 'Nomor WhatsApp wajib diisi.' })
  .trim()
  .transform(normalizePhone)
  .refine((phone) => PHONE_PATTERN.test(phone), { message: PHONE_MESSAGE });

const emailSchema = z
  .string({ error: 'Email wajib diisi.' })
  .trim()
  .toLowerCase()
  .max(254, { message: EMAIL_MESSAGE })
  .refine((email) => EMAIL_PATTERN.test(email), { message: EMAIL_MESSAGE });

const nameSchema = z
  .string({ error: 'Nama lengkap wajib diisi.' })
  .trim()
  .min(1, { message: 'Nama lengkap wajib diisi.' })
  .min(2, { message: 'Nama minimal 2 karakter.' })
  .max(NAME_MAX_LENGTH, { message: 'Nama maksimal 80 karakter.' });

const passwordSchema = z
  .string({ error: 'Kata sandi wajib diisi.' })
  .min(1, { message: 'Kata sandi wajib diisi.' })
  .refine((password) => password.length >= PASSWORD_MIN_LENGTH, {
    message: `Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`,
  })
  .refine((password) => Buffer.byteLength(password, 'utf8') <= PASSWORD_MAX_BYTES, {
    message: `Kata sandi maksimal ${PASSWORD_MAX_BYTES} byte.`,
  })
  .refine((password) => /[a-zA-Z]/.test(password) && /[0-9]/.test(password), {
    message: 'Gabungkan huruf dan angka agar kata sandi lebih kuat.',
  });

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
});

/**
 * The field rules shared with the account forms. Exported so the profile and
 * password schemas in `validators/user.js` reuse one definition of "a valid
 * name/email/phone/password" rather than drifting from these messages.
 */
export const fields = {
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
};

/**
 * Sign-in only checks that the two fields are present and that the email looks
 * like an email: an old password that no longer satisfies the current strength
 * rules must still be able to sign in.
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string({ error: 'Kata sandi wajib diisi.' })
    .min(1, { message: 'Kata sandi wajib diisi.' }),
});

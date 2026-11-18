import { z } from 'zod';
import { fields } from './auth.js';

/**
 * Account schemas: profile patch, password change and shipping addresses.
 *
 * They reuse the register field rules (`fields.name` and friends) so the forms
 * and the API keep producing identical Indonesian messages.
 */

const EMAIL_PASSWORD_MESSAGE = 'Masukkan kata sandi saat ini untuk mengubah email.';

const currentPasswordField = z
  .string({ error: EMAIL_PASSWORD_MESSAGE })
  .min(1, { message: EMAIL_PASSWORD_MESSAGE });

/**
 * A profile patch may carry any subset of the editable fields. Anything else —
 * `role`, `id`, `password` — is stripped rather than rejected, so a client that
 * echoes a whole user object back does not break, but cannot escalate either.
 *
 * Changing the email address additionally requires the current password: a
 * stolen session must not be able to move the login address to another inbox.
 */
export const profilePatchSchema = z
  .object({
    name: fields.name.optional(),
    email: fields.email.optional(),
    phone: fields.phone.optional(),
    currentPassword: currentPasswordField.optional(),
  })
  .strip()
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: 'Tidak ada data yang diubah.',
  })
  .refine((patch) => patch.email === undefined || patch.currentPassword !== undefined, {
    message: EMAIL_PASSWORD_MESSAGE,
    path: ['currentPassword'],
  });

/** Changing only the email, with the password that authorises it. */
export const emailChangeSchema = z.object({
  email: fields.email,
  currentPassword: currentPasswordField,
});

const optionalPasswordStrength = fields.password;

export const passwordChangeSchema = z
  .object({
    currentPassword: z
      .string({ error: 'Masukkan kata sandi saat ini.' })
      .min(1, { message: 'Masukkan kata sandi saat ini.' }),
    newPassword: optionalPasswordStrength,
    // The account form repeats the new password; other API clients need not.
    // When it is sent, it has to match.
    confirmPassword: z.string().optional(),
  })
  .refine(
    (values) =>
      values.confirmPassword === undefined || values.confirmPassword === values.newPassword,
    { message: 'Konfirmasi kata sandi belum sama.', path: ['confirmPassword'] }
  );

// Reusing the current password is *not* checked here: the schema cannot know
// whether `currentPassword` is the real one, and the service only rejects it
// after verifying it (400 `SAME_PASSWORD`), which is the documented contract.

const POSTAL_CODE_PATTERN = /^[0-9]{5}$/;

const ADDRESS_LABEL_MESSAGE = 'Beri nama alamat ini, misalnya Rumah atau Kantor.';

/**
 * One shipping address. Length limits mirror `client/src/lib/validation.js` so
 * a form that passes there cannot fail here.
 */
export const addressSchema = z.object({
  label: z
    .string({ error: ADDRESS_LABEL_MESSAGE })
    .trim()
    .min(1, { message: ADDRESS_LABEL_MESSAGE })
    .max(30, { message: 'Label alamat maksimal 30 karakter.' }),
  recipient: z
    .string({ error: 'Nama penerima wajib diisi.' })
    .trim()
    .min(1, { message: 'Nama penerima wajib diisi.' })
    .min(2, { message: 'Nama penerima minimal 2 karakter.' })
    .max(80, { message: 'Nama penerima maksimal 80 karakter.' }),
  phone: fields.phone,
  street: z
    .string({ error: 'Alamat lengkap wajib diisi.' })
    .trim()
    .min(10, { message: 'Tulis alamat lebih lengkap, termasuk nomor rumah atau patokan.' })
    .max(200, { message: 'Alamat maksimal 200 karakter.' }),
  district: z
    .string({ error: 'Kecamatan wajib diisi.' })
    .trim()
    .min(1, { message: 'Kecamatan wajib diisi.' })
    .max(60, { message: 'Nama kecamatan maksimal 60 karakter.' }),
  city: z
    .string({ error: 'Kota atau kabupaten wajib diisi.' })
    .trim()
    .min(1, { message: 'Kota atau kabupaten wajib diisi.' })
    .max(60, { message: 'Nama kota maksimal 60 karakter.' }),
  province: z
    .string({ error: 'Provinsi wajib diisi.' })
    .trim()
    .min(1, { message: 'Provinsi wajib diisi.' })
    .max(60, { message: 'Nama provinsi maksimal 60 karakter.' }),
  postalCode: z
    .string({ error: 'Kode pos wajib diisi.' })
    .trim()
    .min(1, { message: 'Kode pos wajib diisi.' })
    .refine((value) => POSTAL_CODE_PATTERN.test(value), {
      message: 'Kode pos terdiri dari 5 angka. Contoh: 70123',
    }),
  notes: z
    .string({ error: 'Catatan maksimal 200 karakter.' })
    .trim()
    .max(200, { message: 'Catatan maksimal 200 karakter.' })
    .optional()
    .transform((value) => value ?? ''),
  isDefault: z
    .boolean({ error: 'Penanda alamat utama harus berupa benar atau salah.' })
    .optional()
    .transform((value) => value ?? false),
});

/** Route ids arrive as strings from the URL. */
export const addressIdSchema = z
  .string({ error: 'ID alamat harus berupa angka.' })
  .refine((value) => /^-?\d+$/.test(value), { message: 'ID alamat harus berupa angka.' })
  .transform(Number)
  .refine((value) => value >= 1, { message: 'ID alamat tidak valid.' });

import { describe, it, expect } from 'vitest';
import {
  profilePatchSchema,
  passwordChangeSchema,
  addressSchema,
  addressIdSchema,
} from '../validators/user.js';

function firstMessage(result) {
  return result.success ? null : result.error.issues[0].message;
}

const validAddress = {
  label: 'Rumah',
  recipient: 'Sari Wulandari',
  phone: '081234567890',
  street: 'Jl. Kayu Tangi II No. 18, Banjarmasin',
  district: 'Banjarmasin Utara',
  city: 'Banjarmasin',
  province: 'Kalimantan Selatan',
  postalCode: '70123',
  notes: 'Pagar hijau.',
  isDefault: true,
};

describe('profilePatchSchema', () => {
  it('accepts a partial update and normalises the fields it is given', () => {
    const result = profilePatchSchema.safeParse({
      name: '  Sari Wulandari ',
      email: ' SARI@BaDekor.ID ',
      phone: '+62 812-3456-7890',
      currentPassword: 'rahasia123',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      name: 'Sari Wulandari',
      email: 'sari@badekor.id',
      phone: '081234567890',
      currentPassword: 'rahasia123',
    });
  });

  it('accepts a single field', () => {
    const result = profilePatchSchema.safeParse({ phone: '081234567890' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ phone: '081234567890' });
  });

  it('rejects an empty patch', () => {
    expect(firstMessage(profilePatchSchema.safeParse({}))).toBe('Tidak ada data yang diubah.');
  });

  it('rejects a patch that only carries unknown fields', () => {
    const result = profilePatchSchema.safeParse({ role: 'admin', id: 5 });
    expect(firstMessage(result)).toBe('Tidak ada data yang diubah.');
  });

  it('never lets the role or id through', () => {
    const result = profilePatchSchema.safeParse({ name: 'Sari', role: 'admin', id: 99 });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: 'Sari' });
    expect(result.data).not.toHaveProperty('role');
    expect(result.data).not.toHaveProperty('id');
  });

  it('rejects a password field on the profile patch', () => {
    const result = profilePatchSchema.safeParse({ name: 'Sari', password: 'rahasia123' });

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('password');
  });

  it('rejects an invalid name', () => {
    expect(firstMessage(profilePatchSchema.safeParse({ name: 'A' }))).toBe(
      'Nama minimal 2 karakter.'
    );
  });

  it('rejects an invalid email', () => {
    expect(firstMessage(profilePatchSchema.safeParse({ email: 'bukan-email' }))).toBe(
      'Format email belum benar. Contoh: nama@email.com'
    );
  });

  it('rejects an invalid phone number', () => {
    expect(firstMessage(profilePatchSchema.safeParse({ phone: '0212345' }))).toBe(
      'Nomor WhatsApp belum benar. Contoh: 0812 3456 7890'
    );
  });
});

describe('passwordChangeSchema', () => {
  const valid = { currentPassword: 'rahasia123', newPassword: 'rahasia456' };

  it('accepts a valid change', () => {
    expect(passwordChangeSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts the confirmPassword field the form sends when it matches', () => {
    const result = passwordChangeSchema.safeParse({ ...valid, confirmPassword: 'rahasia456' });
    expect(result.success).toBe(true);
  });

  it('rejects a mismatched confirmPassword when it is sent', () => {
    const result = passwordChangeSchema.safeParse({ ...valid, confirmPassword: 'beda12345' });

    expect(firstMessage(result)).toBe('Konfirmasi kata sandi belum sama.');
  });

  it('does not require confirmPassword from other clients', () => {
    expect(passwordChangeSchema.parse(valid)).toMatchObject(valid);
  });

  it('rejects a missing current password', () => {
    const result = passwordChangeSchema.safeParse({ newPassword: 'rahasia456' });
    expect(firstMessage(result)).toBe('Masukkan kata sandi saat ini.');
  });

  it('rejects a new password that fails the strength rules', () => {
    const result = passwordChangeSchema.safeParse({
      currentPassword: 'rahasia123',
      newPassword: 'pendek',
    });

    expect(firstMessage(result)).toBe('Kata sandi minimal 8 karakter.');
  });

  it('rejects a new password longer than 72 bytes', () => {
    const result = passwordChangeSchema.safeParse({
      currentPassword: 'rahasia123',
      newPassword: `${'é'.repeat(36)}a1`,
    });

    expect(firstMessage(result)).toBe('Kata sandi maksimal 72 byte.');
  });
});

describe('addressSchema', () => {
  it('accepts a full address and normalises the phone', () => {
    const result = addressSchema.safeParse({ ...validAddress, phone: '6281234567890' });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      label: 'Rumah',
      phone: '081234567890',
      postalCode: '70123',
      isDefault: true,
    });
  });

  it('defaults isDefault to false when omitted', () => {
    const withoutDefault = { ...validAddress };
    delete withoutDefault.isDefault;

    expect(addressSchema.parse(withoutDefault).isDefault).toBe(false);
  });

  it('trims every text field', () => {
    const parsed = addressSchema.parse({
      ...validAddress,
      label: '  Rumah  ',
      city: '  Banjarmasin  ',
      notes: '  Pagar hijau.  ',
    });

    expect(parsed.label).toBe('Rumah');
    expect(parsed.city).toBe('Banjarmasin');
    expect(parsed.notes).toBe('Pagar hijau.');
  });

  it('rejects a missing label', () => {
    const result = addressSchema.safeParse({ ...validAddress, label: '' });
    expect(firstMessage(result)).toBe('Beri nama alamat ini, misalnya Rumah atau Kantor.');
  });

  it('rejects a label over 30 characters', () => {
    const result = addressSchema.safeParse({ ...validAddress, label: 'x'.repeat(31) });
    expect(firstMessage(result)).toBe('Label alamat maksimal 30 karakter.');
  });

  it('rejects a recipient shorter than 2 characters', () => {
    const result = addressSchema.safeParse({ ...validAddress, recipient: 'A' });
    expect(firstMessage(result)).toBe('Nama penerima minimal 2 karakter.');
  });

  it('rejects a street shorter than 10 characters', () => {
    const result = addressSchema.safeParse({ ...validAddress, street: 'Jl. A' });
    expect(firstMessage(result)).toBe(
      'Tulis alamat lebih lengkap, termasuk nomor rumah atau patokan.'
    );
  });

  it('rejects a missing district', () => {
    const result = addressSchema.safeParse({ ...validAddress, district: '' });
    expect(firstMessage(result)).toBe('Kecamatan wajib diisi.');
  });

  it('rejects a missing city and province', () => {
    expect(firstMessage(addressSchema.safeParse({ ...validAddress, city: '' }))).toBe(
      'Kota atau kabupaten wajib diisi.'
    );
    expect(firstMessage(addressSchema.safeParse({ ...validAddress, province: '' }))).toBe(
      'Provinsi wajib diisi.'
    );
  });

  it('rejects a postal code that is not five digits', () => {
    expect(firstMessage(addressSchema.safeParse({ ...validAddress, postalCode: '7012' }))).toBe(
      'Kode pos terdiri dari 5 angka. Contoh: 70123'
    );
  });

  it('rejects notes over 200 characters', () => {
    const result = addressSchema.safeParse({ ...validAddress, notes: 'x'.repeat(201) });
    expect(firstMessage(result)).toBe('Catatan maksimal 200 karakter.');
  });

  it('rejects a non-boolean isDefault', () => {
    const result = addressSchema.safeParse({ ...validAddress, isDefault: 'ya' });
    expect(firstMessage(result)).toBe('Penanda alamat utama harus berupa benar atau salah.');
  });
});

describe('addressIdSchema', () => {
  it('accepts a positive integer id', () => {
    expect(addressIdSchema.parse('12')).toBe(12);
  });

  it('rejects a non-numeric id without touching the database', () => {
    expect(firstMessage(addressIdSchema.safeParse('abc'))).toBe('ID alamat harus berupa angka.');
  });

  it('rejects zero and negative ids', () => {
    expect(firstMessage(addressIdSchema.safeParse('0'))).toBe('ID alamat tidak valid.');
    expect(firstMessage(addressIdSchema.safeParse('-4'))).toBe('ID alamat tidak valid.');
  });
});

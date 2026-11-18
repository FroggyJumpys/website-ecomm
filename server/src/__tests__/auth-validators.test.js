import { describe, it, expect } from 'vitest';
import { registerSchema, loginSchema, phoneSchema } from '../validators/auth.js';

const validRegistration = {
  name: 'Sari Wulandari',
  email: 'sari@badekor.id',
  phone: '081234567890',
  password: 'rahasia123',
};

function firstMessage(result) {
  return result.success ? null : result.error.issues[0].message;
}

describe('registerSchema', () => {
  it('accepts a valid registration and lowercases the email', () => {
    const result = registerSchema.safeParse({
      ...validRegistration,
      email: '  Sari@BaDekor.ID ',
    });

    expect(result.success).toBe(true);
    expect(result.data.email).toBe('sari@badekor.id');
    expect(result.data.name).toBe('Sari Wulandari');
  });

  it('normalises a +62 phone number to the local 08 form', () => {
    const result = registerSchema.safeParse({ ...validRegistration, phone: '+62 812-3456-7890' });
    expect(result.success).toBe(true);
    expect(result.data.phone).toBe('081234567890');
  });

  it('rejects a name shorter than 2 characters', () => {
    const result = registerSchema.safeParse({ ...validRegistration, name: 'A' });
    expect(firstMessage(result)).toBe('Nama minimal 2 karakter.');
  });

  it('rejects a malformed email', () => {
    const result = registerSchema.safeParse({ ...validRegistration, email: 'sari@badekor' });
    expect(firstMessage(result)).toBe('Format email belum benar. Contoh: nama@email.com');
  });

  it('rejects a phone number that is not an Indonesian mobile number', () => {
    const result = registerSchema.safeParse({ ...validRegistration, phone: '0212345678' });
    expect(firstMessage(result)).toBe('Nomor WhatsApp belum benar. Contoh: 0812 3456 7890');
  });

  it('rejects a password shorter than 8 characters', () => {
    const result = registerSchema.safeParse({ ...validRegistration, password: 'abc123' });
    expect(firstMessage(result)).toBe('Kata sandi minimal 8 karakter.');
  });

  it('rejects a password without a digit', () => {
    const result = registerSchema.safeParse({ ...validRegistration, password: 'rahasiasaja' });
    expect(firstMessage(result)).toBe(
      'Gabungkan huruf dan angka agar kata sandi lebih kuat.'
    );
  });

  it('rejects a password longer than 72 bytes, counting a multi-byte character as more than one', () => {
    // 37 characters x 2 bytes for "é" = 74 bytes, still under 72 characters.
    const password = `${'é'.repeat(36)}a1`;
    expect(password.length).toBe(38);
    expect(Buffer.byteLength(password, 'utf8')).toBe(74);

    const result = registerSchema.safeParse({ ...validRegistration, password });
    expect(firstMessage(result)).toBe('Kata sandi maksimal 72 byte.');
  });

  it('ignores any role sent by the client', () => {
    const result = registerSchema.safeParse({ ...validRegistration, role: 'admin' });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('role');
  });
});

describe('loginSchema', () => {
  it('accepts an email and password and trims the email', () => {
    const result = loginSchema.safeParse({ email: ' Sari@Badekor.id ', password: 'rahasia123' });
    expect(result.success).toBe(true);
    expect(result.data.email).toBe('sari@badekor.id');
  });

  it('rejects an empty password without applying registration strength rules', () => {
    const result = loginSchema.safeParse({ email: 'sari@badekor.id', password: '' });
    expect(firstMessage(result)).toBe('Kata sandi wajib diisi.');
  });

  it('rejects a malformed email', () => {
    const result = loginSchema.safeParse({ email: 'sari', password: 'rahasia123' });
    expect(firstMessage(result)).toBe('Format email belum benar. Contoh: nama@email.com');
  });
});

describe('phoneSchema', () => {
  it('accepts 0812 style numbers and normalises +62 and 62 prefixes', () => {
    expect(phoneSchema.parse('6281234567890')).toBe('081234567890');
    expect(phoneSchema.parse('+6281234567890')).toBe('081234567890');
    expect(phoneSchema.parse('0812 3456 7890')).toBe('081234567890');
  });

  it('rejects a number that is too short', () => {
    const result = phoneSchema.safeParse('0812345');
    expect(firstMessage(result)).toBe('Nomor WhatsApp belum benar. Contoh: 0812 3456 7890');
  });
});

/**
 * Form validators. Pure functions with no React or network dependency, so the
 * same rules can be reused by the profile and checkout forms and unit-tested
 * in step 07. Every validator returns a Bahasa Indonesia message or `null`.
 */

export const PASSWORD_MIN_LENGTH = 8;

// bcrypt ignores everything past 72 bytes, so the UI rejects it up front.
const PASSWORD_MAX_LENGTH = 72;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^08[1-9][0-9]{6,10}$/;
const POSTAL_CODE_PATTERN = /^[0-9]{5}$/;

export function validateName(value) {
  const name = String(value ?? '').trim();

  if (!name) return 'Nama lengkap wajib diisi.';
  if (name.length < 2) return 'Nama minimal 2 karakter.';
  if (name.length > 80) return 'Nama maksimal 80 karakter.';

  return null;
}

export function validateEmail(value) {
  const email = String(value ?? '').trim();

  if (!email) return 'Email wajib diisi.';
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return 'Format email belum benar. Contoh: nama@email.com';
  }

  return null;
}

/** Accepts 0812…, 62812… and +62812…, and returns the local 08… form. */
export function normalizePhone(value) {
  const digits = String(value ?? '').replace(/[\s().-]/g, '');

  if (digits.startsWith('+62')) return `0${digits.slice(3)}`;
  if (digits.startsWith('62')) return `0${digits.slice(2)}`;

  return digits;
}

export function validatePhone(value) {
  const phone = normalizePhone(value);

  if (!phone) return 'Nomor WhatsApp wajib diisi.';
  if (!PHONE_PATTERN.test(phone)) {
    return 'Nomor WhatsApp belum benar. Contoh: 0812 3456 7890';
  }

  return null;
}

export function validateNewPassword(value) {
  const password = String(value ?? '');

  if (!password) return 'Kata sandi wajib diisi.';
  if (password.length < PASSWORD_MIN_LENGTH) return 'Kata sandi minimal 8 karakter.';
  if (password.length > PASSWORD_MAX_LENGTH) return 'Kata sandi maksimal 72 karakter.';
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Gabungkan huruf dan angka agar kata sandi lebih kuat.';
  }

  return null;
}

/** Field errors for the sign-in form, keyed by field name. */
export function validateLogin(values) {
  const errors = {};

  const emailError = validateEmail(values.email);
  if (emailError) errors.email = emailError;

  if (!String(values.password ?? '')) errors.password = 'Kata sandi wajib diisi.';

  return errors;
}

/** Field errors for the profile form, keyed by field name. */
export function validateProfile(values) {
  const errors = {};

  const nameError = validateName(values.name);
  if (nameError) errors.name = nameError;

  const emailError = validateEmail(values.email);
  if (emailError) errors.email = emailError;

  const phoneError = validatePhone(values.phone);
  if (phoneError) errors.phone = phoneError;

  return errors;
}

/** Field errors for changing a signed-in customer's own password. */
export function validatePasswordChange(values) {
  const errors = {};

  if (!String(values.currentPassword ?? '')) {
    errors.currentPassword = 'Masukkan kata sandi saat ini.';
  }

  const newPasswordError = validateNewPassword(values.newPassword);
  if (newPasswordError) errors.newPassword = newPasswordError;
  else if (values.currentPassword && values.newPassword === values.currentPassword) {
    errors.newPassword = 'Kata sandi baru harus berbeda dari yang sekarang.';
  }

  if (!values.confirmPassword) errors.confirmPassword = 'Ulangi kata sandi baru.';
  else if (values.confirmPassword !== values.newPassword) {
    errors.confirmPassword = 'Konfirmasi kata sandi belum sama.';
  }

  return errors;
}

/** Field errors for creating or editing a shipping address. */
export function validateAddress(values) {
  const errors = {};

  const label = String(values.label ?? '').trim();
  if (!label) errors.label = 'Beri nama alamat ini, misalnya Rumah atau Kantor.';
  else if (label.length > 30) errors.label = 'Label alamat maksimal 30 karakter.';

  const recipient = String(values.recipient ?? '').trim();
  if (!recipient) errors.recipient = 'Nama penerima wajib diisi.';
  else if (recipient.length < 2) errors.recipient = 'Nama penerima minimal 2 karakter.';
  else if (recipient.length > 80) errors.recipient = 'Nama penerima maksimal 80 karakter.';

  const phoneError = validatePhone(values.phone);
  if (phoneError) errors.phone = phoneError;

  const street = String(values.street ?? '').trim();
  if (!street) errors.street = 'Alamat lengkap wajib diisi.';
  else if (street.length < 10) {
    errors.street = 'Tulis alamat lebih lengkap, termasuk nomor rumah atau patokan.';
  } else if (street.length > 200) {
    errors.street = 'Alamat maksimal 200 karakter.';
  }

  const district = String(values.district ?? '').trim();
  if (!district) errors.district = 'Kecamatan wajib diisi.';
  else if (district.length > 60) errors.district = 'Nama kecamatan maksimal 60 karakter.';

  const city = String(values.city ?? '').trim();
  if (!city) errors.city = 'Kota atau kabupaten wajib diisi.';
  else if (city.length > 60) errors.city = 'Nama kota maksimal 60 karakter.';

  const province = String(values.province ?? '').trim();
  if (!province) errors.province = 'Provinsi wajib diisi.';
  else if (province.length > 60) errors.province = 'Nama provinsi maksimal 60 karakter.';

  const postalCode = String(values.postalCode ?? '').trim();
  if (!postalCode) errors.postalCode = 'Kode pos wajib diisi.';
  else if (!POSTAL_CODE_PATTERN.test(postalCode)) {
    errors.postalCode = 'Kode pos terdiri dari 5 angka. Contoh: 70123';
  }

  if (String(values.notes ?? '').length > 200) {
    errors.notes = 'Catatan maksimal 200 karakter.';
  }

  return errors;
}

/**
 * Field errors for the checkout form. The shipping address itself is validated
 * by `validateAddress` when it is created, so here it only has to exist.
 */
export function validateCheckout(values) {
  const errors = {};

  if (!values.address) errors.address = 'Pilih alamat pengiriman lebih dulu.';
  if (!values.shippingMethod) errors.shippingMethod = 'Pilih metode pengiriman.';
  if (!values.paymentMethod) errors.paymentMethod = 'Pilih metode pembayaran.';
  if (!values.terms) errors.terms = 'Centang persetujuan untuk melanjutkan.';

  return errors;
}

/** Field errors for the registration form, keyed by field name. */
export function validateRegister(values) {
  const errors = {};

  const nameError = validateName(values.name);
  if (nameError) errors.name = nameError;

  const emailError = validateEmail(values.email);
  if (emailError) errors.email = emailError;

  const phoneError = validatePhone(values.phone);
  if (phoneError) errors.phone = phoneError;

  const passwordError = validateNewPassword(values.password);
  if (passwordError) errors.password = passwordError;

  if (!values.confirm) errors.confirm = 'Ulangi kata sandi.';
  else if (values.confirm !== values.password) {
    errors.confirm = 'Konfirmasi kata sandi belum sama.';
  }

  if (!values.terms) errors.terms = 'Centang persetujuan untuk melanjutkan.';

  return errors;
}

/* ------------------------------------------------- panel toko (03i) */

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isWholeNumber(value) {
  return String(value).trim() !== '' && Number.isInteger(Number(value));
}

/**
 * Field errors for the admin product form. Prices arrive as input strings, so
 * they are converted here rather than trusted from the DOM.
 */
export function validateProduct(values) {
  const errors = {};

  const name = String(values.name ?? '').trim();
  if (!name) errors.name = 'Nama produk wajib diisi.';
  else if (name.length < 3) errors.name = 'Nama produk minimal 3 karakter.';
  else if (name.length > 120) errors.name = 'Nama produk maksimal 120 karakter.';

  const slug = String(values.slug ?? '').trim();
  if (slug && (slug.length > 80 || !SLUG_PATTERN.test(slug))) {
    errors.slug = 'Slug hanya huruf kecil, angka, dan tanda hubung.';
  }

  if (!values.categorySlug) errors.categorySlug = 'Pilih kategori.';

  if (!isWholeNumber(values.price) || Number(values.price) <= 0) {
    errors.price = 'Harga wajib diisi dengan angka Rupiah tanpa desimal.';
  } else if (Number(values.price) > 1_000_000_000_000) {
    errors.price = 'Harga terlalu besar.';
  }

  const compareAt = String(values.compareAtPrice ?? '').trim();
  if (compareAt) {
    if (!isWholeNumber(compareAt)) {
      errors.compareAtPrice = 'Harga sebelum diskon harus angka Rupiah.';
    } else if (Number(compareAt) <= Number(values.price)) {
      errors.compareAtPrice = 'Harga sebelum diskon harus lebih tinggi dari harga jual.';
    }
  }

  if (!isWholeNumber(values.stock) || Number(values.stock) < 0) {
    errors.stock = 'Stok harus angka 0 atau lebih.';
  } else if (Number(values.stock) > 1_000_000) {
    errors.stock = 'Stok terlalu besar.';
  }

  const material = String(values.material ?? '').trim();
  if (!material) errors.material = 'Bahan wajib diisi.';
  else if (material.length > 120) errors.material = 'Bahan maksimal 120 karakter.';

  const dimensions = String(values.dimensions ?? '').trim();
  if (!dimensions) errors.dimensions = 'Dimensi wajib diisi.';
  else if (dimensions.length > 60) errors.dimensions = 'Dimensi maksimal 60 karakter.';

  const description = String(values.description ?? '').trim();
  if (!description) errors.description = 'Deskripsi wajib diisi.';
  else if (description.length > 800) errors.description = 'Deskripsi maksimal 800 karakter.';

  if (!Array.isArray(values.images) || values.images.length === 0) {
    errors.images = 'Tambahkan minimal satu gambar produk.';
  }

  if (!Array.isArray(values.colors) || values.colors.length === 0) {
    errors.colors = 'Tambahkan minimal satu warna.';
  }

  return errors;
}

/** Field errors for a category or brand row in the panel. */
export function validateTaxonomy(values) {
  const errors = {};

  const name = String(values.name ?? '').trim();
  if (!name) errors.name = 'Nama wajib diisi.';
  else if (name.length < 2) errors.name = 'Nama minimal 2 karakter.';
  else if (name.length > 60) errors.name = 'Nama maksimal 60 karakter.';

  const slug = String(values.slug ?? '').trim();
  if (slug && (slug.length > 80 || !SLUG_PATTERN.test(slug))) {
    errors.slug = 'Slug hanya huruf kecil, angka, dan tanda hubung.';
  }

  if (String(values.description ?? '').length > 200) {
    errors.description = 'Deskripsi maksimal 200 karakter.';
  }

  const image = String(values.image ?? '').trim();
  if (image && !/^\/(images\/|api\/v1\/media\/catalog\/)/.test(image)) {
    errors.image = 'Gunakan path /images/... atau hasil unggahan.';
  }

  return errors;
}

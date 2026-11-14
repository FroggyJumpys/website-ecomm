import { useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { AuthShell } from '../components/auth/AuthShell.jsx';
import { FormAlert } from '../components/ui/FormAlert.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Checkbox, Input, PasswordInput } from '../components/ui/Form.jsx';
import { useAuth } from '../context/authContext.js';
import { focusFirstInvalid } from '../lib/focus.js';
import { routes, safeRedirect } from '../lib/nav.js';
import { normalizePhone, validateRegister } from '../lib/validation.js';

const emptyValues = {
  name: '',
  email: '',
  phone: '',
  password: '',
  confirm: '',
  terms: false,
};

export function RegisterPage() {
  const { status, register } = useAuth();
  const [searchParams] = useSearchParams();
  const formRef = useRef(null);

  const [values, setValues] = useState(emptyValues);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const redirectParam = searchParams.get('redirect');
  const redirectTo = safeRedirect(redirectParam);
  const arrivedFromGuard = Boolean(redirectParam) && redirectTo === redirectParam;
  const loginTo = arrivedFromGuard
    ? `${routes.login}?redirect=${encodeURIComponent(redirectTo)}`
    : routes.login;

  if (status === 'authenticated') {
    return <Navigate to={redirectTo} replace />;
  }

  const updateField = (field) => (event) => {
    const { type, checked, value } = event.target;
    setValues((current) => ({
      ...current,
      [field]: type === 'checkbox' ? checked : value,
    }));

    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFormError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    const fieldErrors = validateRegister(values);
    setErrors(fieldErrors);
    setFormError('');

    if (Object.keys(fieldErrors).length > 0) {
      focusFirstInvalid(formRef.current);
      return;
    }

    setSubmitting(true);

    try {
      await register({
        name: values.name.trim(),
        email: values.email.trim(),
        phone: normalizePhone(values.phone),
        password: values.password,
      });
    } catch (error) {
      if (error.code === 'EMAIL_TAKEN') {
        setErrors({ email: error.message });
        focusFirstInvalid(formRef.current);
      } else {
        setFormError(error.message || 'Pendaftaran gagal. Coba lagi.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Buat akun"
      description="Simpan alamat pengiriman, lacak pesanan, dan simpan produk favorit tanpa mencarinya lagi."
    >
      {arrivedFromGuard && (
        <p className="mb-6 rounded-field border border-sand bg-surface px-3.5 py-3 text-sm text-ink-soft">
          Buat akun dulu untuk membuka halaman yang kamu tuju.
        </p>
      )}

      <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-4">
        {formError && <FormAlert message={formError} />}

        <Input
          id="nama"
          name="name"
          label="Nama lengkap"
          autoComplete="name"
          placeholder="Nama sesuai KTP"
          value={values.name}
          onChange={updateField('name')}
          error={errors.name}
          required
        />

        <Input
          id="email"
          name="email"
          type="email"
          label="Email"
          autoComplete="email"
          placeholder="nama@email.com"
          value={values.email}
          onChange={updateField('email')}
          error={errors.email}
          required
        />

        <Input
          id="telepon"
          name="phone"
          type="tel"
          inputMode="tel"
          label="Nomor WhatsApp"
          hint="Dipakai kurir untuk konfirmasi jadwal pengiriman."
          autoComplete="tel"
          placeholder="0812 3456 7890"
          value={values.phone}
          onChange={updateField('phone')}
          error={errors.phone}
          required
        />

        <PasswordInput
          id="kata-sandi"
          name="password"
          label="Kata sandi"
          hint="Minimal 8 karakter, gabungkan huruf dan angka."
          autoComplete="new-password"
          placeholder="Buat kata sandi"
          value={values.password}
          onChange={updateField('password')}
          error={errors.password}
          required
        />

        <PasswordInput
          id="ulangi-kata-sandi"
          name="confirm"
          label="Ulangi kata sandi"
          autoComplete="new-password"
          placeholder="Ketik ulang kata sandi"
          value={values.confirm}
          onChange={updateField('confirm')}
          error={errors.confirm}
          required
        />

        <div className="pt-1">
          <Checkbox
            id="syarat"
            name="terms"
            checked={values.terms}
            onChange={updateField('terms')}
            error={errors.terms}
            label="Saya setuju dengan syarat layanan dan kebijakan privasi BaDekor."
          />
        </div>

        <Button type="submit" size="lg" fullWidth loading={submitting}>
          {submitting ? 'Membuat akun…' : 'Buat akun'}
        </Button>
      </form>

      <p className="mt-6 text-sm text-ink-soft">
        Sudah punya akun?{' '}
        <Link
          to={loginTo}
          className="font-medium text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink"
        >
          Masuk
        </Link>
      </p>
    </AuthShell>
  );
}

import { useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { AuthShell } from '../components/auth/AuthShell.jsx';
import { FormAlert } from '../components/ui/FormAlert.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input, PasswordInput } from '../components/ui/Form.jsx';
import { useAuth } from '../context/authContext.js';
import { DEMO_ACCOUNTS } from '../lib/demoAccounts.js';
import { focusFirstInvalid } from '../lib/focus.js';
import { routes, safeRedirect } from '../lib/nav.js';
import { validateLogin } from '../lib/validation.js';

const emptyValues = { email: '', password: '' };

/** Accounts seeded by `npm run db:seed`, so both roles can be tried at once. */
function DemoAccounts({ onPick }) {
  return (
    <section aria-labelledby="akun-demo" className="mt-10 border-t border-sand pt-6">
      <h2 id="akun-demo" className="text-spec text-ink-soft">
        Akun demo
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Pilih salah satu untuk mengisi formulir, lalu tekan Masuk.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {DEMO_ACCOUNTS.map((account) => (
          <button
            key={account.email}
            type="button"
            onClick={() => onPick(account)}
            className="rounded-field border border-ink/15 bg-surface px-3.5 py-2.5 text-left transition hover:border-ink/40 hover:bg-ink/[0.02]"
          >
            <span className="block text-sm font-medium text-ink">{account.label}</span>
            <span className="block truncate text-spec text-ink-soft">{account.email}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function LoginPage() {
  const { status, login } = useAuth();
  const [searchParams] = useSearchParams();
  const formRef = useRef(null);

  const [values, setValues] = useState(emptyValues);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const redirectParam = searchParams.get('redirect');
  const redirectTo = safeRedirect(redirectParam);
  const arrivedFromGuard = Boolean(redirectParam) && redirectTo === redirectParam;
  const registerTo = arrivedFromGuard
    ? `${routes.register}?redirect=${encodeURIComponent(redirectTo)}`
    : routes.register;

  if (status === 'authenticated') {
    return <Navigate to={redirectTo} replace />;
  }

  const updateField = (field) => (event) => {
    const { type, checked, value } = event.target;
    setValues((current) => ({
      ...current,
      [field]: type === 'checkbox' ? checked : value,
    }));

    // Re-checked on the next submit; clearing here keeps the message honest
    // while the person is fixing the field.
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFormError('');
  };

  const pickDemoAccount = (account) => {
    setValues({ email: account.email, password: account.password });
    setErrors({});
    setFormError('');
    document.getElementById('email')?.focus();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    const fieldErrors = validateLogin(values);
    setErrors(fieldErrors);
    setFormError('');

    if (Object.keys(fieldErrors).length > 0) {
      focusFirstInvalid(formRef.current);
      return;
    }

    setSubmitting(true);

    try {
      await login({
        email: values.email.trim(),
        password: values.password,
      });
    } catch (error) {
      setFormError(error.message || 'Tidak dapat masuk. Coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Masuk"
      description="Lanjutkan pesanan, simpan favorit, dan lihat riwayat belanja di satu tempat."
    >
      {arrivedFromGuard && (
        <p className="mb-6 rounded-field border border-sand bg-surface px-3.5 py-3 text-sm text-ink-soft">
          Masuk dulu untuk membuka halaman yang kamu tuju.
        </p>
      )}

      <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-4">
        {formError && <FormAlert message={formError} />}

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

        <PasswordInput
          id="kata-sandi"
          name="password"
          label="Kata sandi"
          autoComplete="current-password"
          placeholder="Kata sandi akunmu"
          value={values.password}
          onChange={updateField('password')}
          error={errors.password}
          required
        />

        <Button type="submit" size="lg" fullWidth loading={submitting}>
          {submitting ? 'Memeriksa…' : 'Masuk'}
        </Button>
      </form>

      <p className="mt-6 text-sm text-ink-soft">
        Belum punya akun?{' '}
        <Link
          to={registerTo}
          className="font-medium text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink"
        >
          Daftar sekarang
        </Link>
      </p>

      <DemoAccounts onPick={pickDemoAccount} />
    </AuthShell>
  );
}

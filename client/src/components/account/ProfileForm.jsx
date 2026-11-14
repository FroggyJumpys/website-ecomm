import { useRef, useState } from 'react';
import { FiCheck } from 'react-icons/fi';
import { Button } from '../ui/Button.jsx';
import { FormAlert } from '../ui/FormAlert.jsx';
import { Input } from '../ui/Form.jsx';
import { useAuth } from '../../context/authContext.js';
import { useUpdateProfile } from '../../hooks/useAccount.js';
import { focusFirstInvalid } from '../../lib/focus.js';
import { validateProfile } from '../../lib/validation.js';

/**
 * Profile details form. Saving goes through AuthProvider, so the header
 * monogram and the account rail update without a reload.
 */
export function ProfileForm() {
  const { user } = useAuth();
  const mutation = useUpdateProfile();
  const formRef = useRef(null);

  const [values, setValues] = useState({
    name: user?.name ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState(false);

  const dirty =
    values.name !== (user?.name ?? '') ||
    values.email !== (user?.email ?? '') ||
    values.phone !== (user?.phone ?? '');

  const updateField = (field) => (event) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));

    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFormError('');
    setSaved(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (mutation.isPending) return;

    const fieldErrors = validateProfile(values);
    setErrors(fieldErrors);
    setFormError('');
    setSaved(false);

    if (Object.keys(fieldErrors).length > 0) {
      focusFirstInvalid(formRef.current);
      return;
    }

    const payload = {
      name: values.name.trim(),
      email: values.email.trim().toLowerCase(),
      phone: values.phone.trim(),
    };

    try {
      await mutation.mutateAsync(payload);
      setValues(payload);
      setSaved(true);
    } catch (error) {
      if (error.code === 'EMAIL_TAKEN') {
        setErrors({ email: error.message });
        focusFirstInvalid(formRef.current);
      } else {
        setFormError(error.message || 'Profil tidak dapat disimpan. Coba lagi.');
      }
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-4">
      {formError && <FormAlert message={formError} />}

      <Input
        id="profil-nama"
        name="name"
        label="Nama lengkap"
        autoComplete="name"
        value={values.name}
        onChange={updateField('name')}
        error={errors.name}
        required
      />

      <Input
        id="profil-email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        hint="Dipakai untuk masuk dan menerima kabar pesanan."
        value={values.email}
        onChange={updateField('email')}
        error={errors.email}
        required
      />

      <Input
        id="profil-telepon"
        name="phone"
        type="tel"
        label="Nomor WhatsApp"
        autoComplete="tel"
        hint="Kurir memakai nomor ini untuk mengabari jadwal antar."
        value={values.phone}
        onChange={updateField('phone')}
        error={errors.phone}
        required
      />

      <div className="flex flex-wrap items-center gap-4 pt-1">
        <Button type="submit" loading={mutation.isPending} disabled={!dirty}>
          {mutation.isPending ? 'Menyimpan…' : 'Simpan perubahan'}
        </Button>
        {!dirty && !saved && <p className="text-sm text-ink-soft">Tidak ada perubahan.</p>}
        {saved && (
          <p role="status" className="inline-flex items-center gap-1.5 text-sm text-success">
            <FiCheck className="size-4" aria-hidden="true" />
            Perubahan tersimpan.
          </p>
        )}
      </div>
    </form>
  );
}

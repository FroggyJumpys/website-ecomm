import { useRef, useState } from 'react';
import { FiCheck } from 'react-icons/fi';
import { Button } from '../ui/Button.jsx';
import { FormAlert } from '../ui/FormAlert.jsx';
import { PasswordInput } from '../ui/Form.jsx';
import { useChangePassword } from '../../hooks/useAccount.js';
import { focusFirstInvalid } from '../../lib/focus.js';
import { validatePasswordChange } from '../../lib/validation.js';

const emptyValues = { currentPassword: '', newPassword: '', confirmPassword: '' };

/**
 * Changing the password requires the current one, exactly like 04b's endpoint.
 * On success the fields are cleared and a status line confirms the change; the
 * session stays valid, which is what a customer expects after changing it.
 */
export function PasswordForm() {
  const mutation = useChangePassword();
  const formRef = useRef(null);

  const [values, setValues] = useState(emptyValues);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState(false);

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

    const fieldErrors = validatePasswordChange(values);
    setErrors(fieldErrors);
    setFormError('');
    setSaved(false);

    if (Object.keys(fieldErrors).length > 0) {
      focusFirstInvalid(formRef.current);
      return;
    }

    try {
      await mutation.mutateAsync(values);
      setValues(emptyValues);
      setSaved(true);
    } catch (error) {
      if (error.code === 'INVALID_PASSWORD') {
        setErrors({ currentPassword: error.message });
        focusFirstInvalid(formRef.current);
      } else if (error.code === 'SAME_PASSWORD') {
        setErrors({ newPassword: error.message });
        focusFirstInvalid(formRef.current);
      } else {
        setFormError(error.message || 'Kata sandi tidak dapat diubah. Coba lagi.');
      }
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-4">
      {formError && <FormAlert message={formError} />}

      <PasswordInput
        id="sandi-saat-ini"
        name="currentPassword"
        label="Kata sandi saat ini"
        autoComplete="current-password"
        value={values.currentPassword}
        onChange={updateField('currentPassword')}
        error={errors.currentPassword}
        required
      />

      <PasswordInput
        id="sandi-baru"
        name="newPassword"
        label="Kata sandi baru"
        autoComplete="new-password"
        hint="Minimal 8 karakter, gabungkan huruf dan angka."
        value={values.newPassword}
        onChange={updateField('newPassword')}
        error={errors.newPassword}
        required
      />

      <PasswordInput
        id="ulangi-sandi-baru"
        name="confirmPassword"
        label="Ulangi kata sandi baru"
        autoComplete="new-password"
        value={values.confirmPassword}
        onChange={updateField('confirmPassword')}
        error={errors.confirmPassword}
        required
      />

      <div className="flex flex-wrap items-center gap-4 pt-1">
        <Button type="submit" variant="outline" loading={mutation.isPending}>
          {mutation.isPending ? 'Memperbarui…' : 'Perbarui kata sandi'}
        </Button>
        {saved && (
          <p role="status" className="inline-flex items-center gap-1.5 text-sm text-success">
            <FiCheck className="size-4" aria-hidden="true" />
            Kata sandi diperbarui.
          </p>
        )}
      </div>
    </form>
  );
}

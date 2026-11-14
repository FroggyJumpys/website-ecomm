import { useRef, useState } from 'react';
import { Button } from '../ui/Button.jsx';
import { Checkbox, Input, Textarea } from '../ui/Form.jsx';
import { FormAlert } from '../ui/FormAlert.jsx';
import { focusFirstInvalid } from '../../lib/focus.js';
import { validateAddress } from '../../lib/validation.js';

const emptyValues = {
  label: '',
  recipient: '',
  phone: '',
  street: '',
  district: '',
  city: '',
  province: '',
  postalCode: '',
  notes: '',
  isDefault: false,
};

/**
 * Create/edit form for a shipping address. The parent supplies `onSubmit` and
 * the modal owns the frame; the form only handles validation and the request
 * state so the same component works for both modes.
 */
export function AddressForm({ address, onSubmit, onCancel, submitting }) {
  const formRef = useRef(null);
  const [values, setValues] = useState(() => ({ ...emptyValues, ...address }));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');

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

    const fieldErrors = validateAddress(values);
    setErrors(fieldErrors);
    setFormError('');

    if (Object.keys(fieldErrors).length > 0) {
      focusFirstInvalid(formRef.current);
      return;
    }

    try {
      await onSubmit({
        label: values.label.trim(),
        recipient: values.recipient.trim(),
        phone: values.phone.trim(),
        street: values.street.trim(),
        district: values.district.trim(),
        city: values.city.trim(),
        province: values.province.trim(),
        postalCode: values.postalCode.trim(),
        notes: values.notes.trim(),
        isDefault: values.isDefault,
      });
    } catch (error) {
      setFormError(error.message || 'Alamat tidak dapat disimpan. Coba lagi.');
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-4">
      {formError && <FormAlert message={formError} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          id="alamat-label"
          name="label"
          label="Label alamat"
          placeholder="Rumah, Kantor, Rumah orang tua"
          value={values.label}
          onChange={updateField('label')}
          error={errors.label}
          required
        />
        <Input
          id="alamat-penerima"
          name="recipient"
          label="Nama penerima"
          autoComplete="name"
          placeholder="Nama sesuai KTP"
          value={values.recipient}
          onChange={updateField('recipient')}
          error={errors.recipient}
          required
        />
        <Input
          id="alamat-telepon"
          name="phone"
          type="tel"
          label="Nomor WhatsApp"
          autoComplete="tel"
          placeholder="0812 3456 7890"
          value={values.phone}
          onChange={updateField('phone')}
          error={errors.phone}
          required
        />
        <Input
          id="alamat-kode-pos"
          name="postalCode"
          label="Kode pos"
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="70123"
          value={values.postalCode}
          onChange={updateField('postalCode')}
          error={errors.postalCode}
          required
        />
      </div>

      <Textarea
        id="alamat-jalan"
        name="street"
        label="Alamat lengkap"
        autoComplete="street-address"
        rows={3}
        placeholder="Nama jalan, nomor rumah, RT/RW, patokan"
        value={values.street}
        onChange={updateField('street')}
        error={errors.street}
        required
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          id="alamat-kecamatan"
          name="district"
          label="Kecamatan"
          value={values.district}
          onChange={updateField('district')}
          error={errors.district}
          required
        />
        <Input
          id="alamat-kota"
          name="city"
          label="Kota atau kabupaten"
          value={values.city}
          onChange={updateField('city')}
          error={errors.city}
          required
        />
        <div className="sm:col-span-2">
          <Input
            id="alamat-provinsi"
            name="province"
            label="Provinsi"
            value={values.province}
            onChange={updateField('province')}
            error={errors.province}
            required
          />
        </div>
      </div>

      <Textarea
        id="alamat-catatan"
        name="notes"
        label="Catatan untuk kurir"
        hint="Opsional. Misalnya patokan rumah atau jam yang aman untuk menerima paket."
        error={errors.notes}
        rows={2}
        placeholder="Pagar hijau, bel di sebelah kanan."
        value={values.notes}
        onChange={updateField('notes')}
      />

      <Checkbox
        id="alamat-utama"
        name="isDefault"
        label="Jadikan alamat utama untuk pengiriman berikutnya"
        checked={values.isDefault}
        onChange={updateField('isDefault')}
      />

      <div className="flex flex-wrap items-center gap-3 border-t border-sand pt-4">
        <Button type="submit" loading={submitting}>
          {submitting ? 'Menyimpan…' : 'Simpan alamat'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
          Batal
        </Button>
      </div>
    </form>
  );
}

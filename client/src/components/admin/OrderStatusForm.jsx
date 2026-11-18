import { useEffect, useState } from 'react';
import { Button } from '../ui/Button.jsx';
import { Input, Select } from '../ui/Form.jsx';
import { FormAlert } from '../ui/FormAlert.jsx';
import { allowedNextStatuses, statusMeta } from '../../lib/orderStatus.js';

/**
 * Status control for one order. It offers only the targets the API accepts:
 * the transition table is shared policy, and a change that skipped it would be
 * a `409 ORDER_STATUS_CONFLICT`. `completed` and `cancelled` are terminal, so
 * the form explains that instead of showing an empty select.
 *
 * The tracking number travels with the status request: setting it is part of
 * "this order left the workshop", and the server accepts it on the move to
 * shipped. Leaving the field untouched omits it, so the stored number is kept;
 * clearing it sends `""`.
 */
export function OrderStatusForm({ order, submitting = false, onSubmit }) {
  const allowed = allowedNextStatuses(order.status);
  const [status, setStatus] = useState('');
  const [tracking, setTracking] = useState(order.trackingNumber ?? '');
  const [formError, setFormError] = useState('');

  // A refetched order may arrive with a newer status or tracking number.
  useEffect(() => {
    setStatus('');
    setTracking(order.trackingNumber ?? '');
  }, [order.status, order.trackingNumber]);

  if (allowed.length === 0) {
    return (
      <p className="rounded-field bg-sand/60 px-4 py-3 text-sm text-ink-soft">
        Status{' '}
        <span className="font-medium text-ink">{statusMeta(order.status).label.toLowerCase()}</span>{' '}
        adalah status akhir. Pesanan ini tidak dapat dipindahkan lagi.
      </p>
    );
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!status || submitting) return;

    setFormError('');

    try {
      const trimmed = tracking.trim();
      const payload = { status };

      if (trimmed !== (order.trackingNumber ?? '')) payload.trackingNumber = trimmed;

      await onSubmit(payload);
      setStatus('');
    } catch (error) {
      setFormError(error.message || 'Status pesanan tidak dapat disimpan. Coba lagi.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {formError && <FormAlert message={formError} />}

      <Select
        id="status-pesanan"
        label="Status baru"
        value={status}
        onChange={(event) => {
          setStatus(event.target.value);
          setFormError('');
        }}
        hint={
          status
            ? statusMeta(status).description
            : 'Pilih salah satu status yang tersedia untuk pesanan ini.'
        }
      >
        <option value="">Pilih status baru</option>
        {allowed.map((value) => (
          <option key={value} value={value}>
            {statusMeta(value).label}
          </option>
        ))}
      </Select>

      <Input
        id="resi-pesanan"
        label="Nomor resi"
        value={tracking}
        maxLength={64}
        onChange={(event) => {
          setTracking(event.target.value);
          setFormError('');
        }}
        hint="Opsional. Kosongkan untuk menghapus nomor resi yang tersimpan."
      />

      <Button type="submit" size="sm" disabled={!status} loading={submitting}>
        Simpan status
      </Button>
    </form>
  );
}

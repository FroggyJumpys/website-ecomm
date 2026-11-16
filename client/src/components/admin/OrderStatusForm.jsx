import { useEffect, useState } from 'react';
import { Button } from '../ui/Button.jsx';
import { Select } from '../ui/Form.jsx';
import { FormAlert } from '../ui/FormAlert.jsx';
import { ORDER_STATUS, statusMeta } from '../../lib/orderStatus.js';

const statusOptions = Object.entries(ORDER_STATUS).map(([value, meta]) => ({
  value,
  label: meta.label,
}));

/**
 * Status control for one order. It only appears on the admin detail screen and
 * writes through the same timeline the customer reads, so a change made here is
 * the next entry in their order history.
 */
export function OrderStatusForm({ order, submitting = false, onSubmit }) {
  const [status, setStatus] = useState(order.status);
  const [formError, setFormError] = useState('');

  // A refetched order may arrive with a newer status than the local choice.
  useEffect(() => {
    setStatus(order.status);
  }, [order.status]);

  const changed = status !== order.status;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!changed || submitting) return;

    setFormError('');

    try {
      await onSubmit(status);
    } catch (error) {
      setFormError(error.message || 'Status pesanan tidak dapat disimpan. Coba lagi.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {formError && <FormAlert message={formError} />}

      <Select
        id="status-pesanan"
        label="Status pesanan"
        value={status}
        onChange={(event) => {
          setStatus(event.target.value);
          setFormError('');
        }}
        hint={statusMeta(status).description}
      >
        {statusOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>

      <Button type="submit" size="sm" disabled={!changed} loading={submitting}>
        Simpan status
      </Button>
    </form>
  );
}

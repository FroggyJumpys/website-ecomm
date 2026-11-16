import { PAYMENT_OPTIONS } from '../../lib/shipping.js';
import { RadioCard } from '../ui/RadioCard.jsx';

/** Payment methods. The selected label is stored as `payment_method`. */
export function PaymentPicker({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Metode pembayaran" className="space-y-3">
      {PAYMENT_OPTIONS.map((option) => (
        <RadioCard
          key={option.id}
          name="metode-pembayaran"
          value={option.id}
          checked={value === option.id}
          onChange={() => onChange(option.id)}
          title={option.label}
          description={option.detail}
        />
      ))}
    </div>
  );
}

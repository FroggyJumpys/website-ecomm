import { formatIDR } from '../../lib/format.js';
import { SHIPPING_OPTIONS } from '../../lib/shipping.js';
import { RadioCard } from '../ui/RadioCard.jsx';

/** Delivery options, priced. The cost feeds the order's `shipping_cost`. */
export function ShippingPicker({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Metode pengiriman" className="space-y-3">
      {SHIPPING_OPTIONS.map((option) => (
        <RadioCard
          key={option.id}
          name="metode-pengiriman"
          value={option.id}
          checked={value === option.id}
          onChange={() => onChange(option.id)}
          title={option.label}
          meta={
            <span className="tabular text-sm font-medium text-ink">
              {option.cost === 0 ? 'Gratis' : formatIDR(option.cost)}
            </span>
          }
          description={option.description}
        >
          <span className="mt-1 block text-spec text-ink-soft">
            {option.carrier} · {option.estimate}
          </span>
        </RadioCard>
      ))}
    </div>
  );
}

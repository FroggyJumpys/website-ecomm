import { FiMinus, FiPlus } from 'react-icons/fi';
import { cn } from '../../lib/cn.js';

/**
 * Controlled quantity stepper used on the product page and in the cart.
 */
export function QuantityStepper({ value, onChange, min = 1, max = 99, className, label = 'Jumlah' }) {
  const clamp = (next) => Math.min(max, Math.max(min, next));

  return (
    <div
      className={cn(
        'inline-flex h-11 items-center rounded-full border border-ink/15 bg-surface',
        className
      )}
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= min}
        aria-label="Kurangi jumlah"
        className="grid h-full w-11 place-items-center rounded-l-full text-ink-soft transition hover:text-ink disabled:opacity-40"
      >
        <FiMinus className="size-4" />
      </button>

      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(clamp(Number(event.target.value) || min))}
        aria-label={label}
        className="tabular w-10 border-0 bg-transparent p-0 text-center text-sm font-medium text-ink focus:ring-0"
      />

      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= max}
        aria-label="Tambah jumlah"
        className="grid h-full w-11 place-items-center rounded-r-full text-ink-soft transition hover:text-ink disabled:opacity-40"
      >
        <FiPlus className="size-4" />
      </button>
    </div>
  );
}

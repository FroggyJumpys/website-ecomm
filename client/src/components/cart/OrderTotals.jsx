import { PriceRow } from '../ui/Price.jsx';
import { formatIDR } from '../../lib/format.js';
import { cn } from '../../lib/cn.js';

/**
 * Subtotal / shipping / discount / total block shared by the cart page, the
 * checkout aside and the order confirmation. `shippingCost` of `null` means
 * "not known yet" and prints the note instead of an amount; the total then
 * equals the subtotal.
 */
export function OrderTotals({
  subtotal,
  shippingCost = null,
  discount = 0,
  shippingNote = 'Dihitung saat pembayaran',
  className,
}) {
  const total = subtotal - discount + (shippingCost ?? 0);

  return (
    <div className={cn('space-y-2.5', className)}>
      <PriceRow label="Subtotal" value={subtotal} />

      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="text-ink-soft">Ongkos kirim</span>
        {shippingCost === null ? (
          <span className="text-spec text-ink-soft">{shippingNote}</span>
        ) : (
          <span className="tabular text-ink">
            {shippingCost === 0 ? 'Gratis' : formatIDR(shippingCost)}
          </span>
        )}
      </div>

      {discount > 0 && (
        <div className="flex items-baseline justify-between gap-4 text-sm">
          <span className="text-ink-soft">Diskon</span>
          <span className="tabular text-success">-{formatIDR(discount)}</span>
        </div>
      )}

      <div className="border-t border-ink/20 pt-2.5">
        <PriceRow label="Total" value={total} strong />
      </div>
    </div>
  );
}

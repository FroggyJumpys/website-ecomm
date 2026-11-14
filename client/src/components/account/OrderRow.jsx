import { Link } from 'react-router-dom';
import { OrderStatusBadge } from './OrderStatusBadge.jsx';
import { formatDate, formatIDR } from '../../lib/format.js';
import { routes } from '../../lib/nav.js';

function itemsSummary(order) {
  const [first, ...rest] = order.items;

  if (!first) return 'Tidak ada barang';
  return rest.length > 0 ? `${first.name} dan ${rest.length} produk lain` : first.name;
}

/**
 * One order in the history and on the overview. Deliberately a ledger row
 * rather than a card: order number, date, status, items, total and the detail
 * link all line up on one baseline so a list of four orders scans quickly.
 */
export function OrderRow({ order }) {
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <article className="border-b border-sand py-5 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <p className="font-display text-sm font-medium text-ink">{order.orderNumber}</p>
          <p className="text-spec text-ink-soft">{formatDate(order.createdAt)}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex shrink-0 -space-x-3">
          {order.items.slice(0, 3).map((item) => (
            <img
              key={`${item.productId}-${item.color}-${item.size}`}
              src={item.image}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-12 rounded-field border-2 border-paper bg-sand object-cover"
            />
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-ink">{itemsSummary(order)}</p>
          <p className="text-spec text-ink-soft">
            {itemCount} barang, {order.paymentMethod}
          </p>
        </div>

        <div className="flex w-full items-center justify-between gap-4 border-t border-sand/70 pt-3 sm:w-auto sm:border-0 sm:pt-0">
          <div className="text-left sm:text-right">
            <p className="text-spec text-ink-soft">Total</p>
            <p className="tabular font-display text-sm font-semibold text-ink">
              {formatIDR(order.total)}
            </p>
          </div>

          <Link
            to={routes.accountOrder(order.orderNumber)}
            className="text-sm font-medium text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink"
          >
            Lihat detail
          </Link>
        </div>
      </div>
    </article>
  );
}

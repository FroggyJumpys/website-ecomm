import { FiCheck } from 'react-icons/fi';
import { formatDate } from '../../lib/format.js';
import { ORDER_FLOW, statusMeta } from '../../lib/orderStatus.js';
import { cn } from '../../lib/cn.js';

/**
 * Horizontal status sequence for a live order. This is a real sequence, so the
 * step markers carry meaning; a cancelled order skips it entirely and the
 * detail page shows the cancellation reason instead.
 */
export function OrderTimeline({ order }) {
  if (order.status === 'cancelled') return null;

  return (
    <section
      aria-labelledby="status-pesanan"
      className="rounded-card border border-sand bg-surface p-5 sm:p-6"
    >
      <h2 id="status-pesanan" className="font-display text-heading text-ink">
        Status pesanan
      </h2>
      <p className="mt-1 text-sm text-ink-soft">{statusMeta(order.status).description}</p>

      <div className="relative mt-6">
        <div aria-hidden="true" className="absolute left-3.5 right-3.5 top-3.5 h-px bg-sand" />
        <ol className="relative grid grid-cols-3 gap-3">
          {ORDER_FLOW.map((status) => {
            const event = order.timeline?.find((entry) => entry.status === status);
            const done = Boolean(event);

            return (
              <li key={status} className="flex flex-col items-start">
                <span
                  className={cn(
                    'grid size-7 place-items-center rounded-full border',
                    done ? 'border-ink bg-ink text-paper' : 'border-sand bg-surface text-ink-soft'
                  )}
                >
                  {done ? (
                    <FiCheck className="size-3.5" aria-hidden="true" />
                  ) : (
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                  )}
                </span>
                <span
                  className={cn('mt-2 text-sm', done ? 'font-medium text-ink' : 'text-ink-soft')}
                >
                  {statusMeta(status).label}
                </span>
                <span className="text-spec text-ink-soft">
                  {event ? formatDate(event.at) : 'Belum'}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

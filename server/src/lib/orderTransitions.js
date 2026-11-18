/**
 * Order status policy for the admin API.
 *
 * The happy path is forward-only: an order that was shipped cannot silently
 * become "processing" again, and `completed` and `cancelled` are terminal. The
 * two terminal states are what make cancellation safe: because a cancelled
 * order can never leave `cancelled`, the stock restore that accompanies the
 * cancellation runs at most once, even under concurrent requests.
 *
 * `cancelled` is reachable from both open states. Cancelling after an order was
 * delivered (`completed`) is refused: the goods have left the workshop, and
 * restocking them would invent inventory that never came back.
 *
 * The list of allowed targets is also what the conflict response returns, so
 * the panel can tell the operator what it may do next without duplicating this
 * table in the client.
 */
export const ORDER_STATUSES = ['processing', 'shipped', 'completed', 'cancelled'];

export const ORDER_TRANSITIONS = {
  processing: ['shipped', 'cancelled'],
  shipped: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

/** Shown to the customer when an operator cancels without supplying a reason. */
export const DEFAULT_CANCELLATION_REASON = 'Pesanan dibatalkan oleh admin toko.';

export function allowedTransitions(from) {
  return ORDER_TRANSITIONS[from] ?? [];
}

/** True only for an actual move; `from === to` is handled as a no-op elsewhere. */
export function canTransition(from, to) {
  return allowedTransitions(from).includes(to);
}

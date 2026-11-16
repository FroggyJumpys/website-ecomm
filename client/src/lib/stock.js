/**
 * Stock vocabulary shared by the admin dashboard and the product table, so the
 * "low stock" number on one screen and the warning badge on the other cannot
 * disagree.
 */

export const LOW_STOCK_THRESHOLD = 5;

/** 'out' when sold out, 'low' at or below the threshold, otherwise 'ok'. */
export function stockStatus(stock) {
  const quantity = Number(stock) || 0;

  if (quantity <= 0) return 'out';
  if (quantity <= LOW_STOCK_THRESHOLD) return 'low';
  return 'ok';
}

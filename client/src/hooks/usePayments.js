import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchPaymentConfig,
  fetchPaymentState,
  startPayment,
  syncPayment,
} from '../services/payments.js';

/**
 * Payment server-state hooks.
 *
 * Starting or syncing a payment changes the order's `paymentStatus`, so both
 * invalidate the order queries rather than patching a cached value: the server
 * is the only place that knows whether the money actually arrived. The stored
 * payment state is invalidated too, because a sync can also reveal a QRIS code
 * or an expiry that the panel did not know about yet.
 */

export function usePaymentConfig() {
  return useQuery({
    queryKey: ['payments', 'config'],
    queryFn: fetchPaymentConfig,
    // The keys change only when the server is redeployed.
    staleTime: Infinity,
    retry: false,
  });
}

/**
 * The stored payment state of one order. It never creates a provider
 * transaction, so the order page may read it on every visit, and a QRIS code
 * that already exists is redrawn from here instead of being asked for again.
 */
export function usePaymentState(orderNumber) {
  return useQuery({
    queryKey: ['payments', 'state', orderNumber],
    queryFn: () => fetchPaymentState(orderNumber),
    enabled: Boolean(orderNumber),
    staleTime: 10_000,
    // A missing order or a session that just ended is not worth retrying.
    retry: false,
  });
}

function usePaymentMutation(mutationFn) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['payments', 'state'] });
    },
  });
}

export function useStartPayment() {
  return usePaymentMutation(startPayment);
}

export function useSyncPayment() {
  return usePaymentMutation(syncPayment);
}

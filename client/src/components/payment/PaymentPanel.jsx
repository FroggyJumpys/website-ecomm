import { useState } from 'react';
import { FiCheckCircle, FiCreditCard, FiLock, FiRefreshCw } from 'react-icons/fi';
import { Button } from '../ui/Button.jsx';
import { FormAlert } from '../ui/FormAlert.jsx';
import { PaymentInstructions } from './PaymentInstructions.jsx';
import { PaymentStatusBadge } from './PaymentStatusBadge.jsx';
import { QrisPanel } from './QrisPanel.jsx';
import {
  usePaymentConfig,
  usePaymentState,
  useStartPayment,
  useSyncPayment,
} from '../../hooks/usePayments.js';
import { canPayOrder, paymentStatusMeta } from '../../lib/paymentStatus.js';
import { paymentInstructions } from '../../lib/shipping.js';
import { loadSnap, openSnapPayment } from '../../lib/snap.js';

/**
 * The payment block on the confirmation and order-detail pages.
 *
 * The button opens the Midtrans Snap popup. Its callbacks are treated as hints
 * only: `onSuccess` asks the server to sync the provider status, and the server
 * decides whether the order is paid. A closed popup therefore never leaves the
 * screen claiming something the database does not agree with.
 *
 * When the server has no Midtrans credentials (503 `PAYMENT_NOT_CONFIGURED`),
 * the panel falls back to the written transfer instructions instead of
 * presenting a button that cannot work.
 *
 * A QRIS order also gets the stored attempt rendered here: the dynamic code and
 * its expiry come from `GET /orders/:orderNumber/payments`, so a reload shows the
 * same code instead of opening a second provider transaction.
 */
export function PaymentPanel({ order, onUpdated, className }) {
  const configQuery = usePaymentConfig();
  const stateQuery = usePaymentState(order.orderNumber);
  const startPayment = useStartPayment();
  const syncPayment = useSyncPayment();

  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [fallback, setFallback] = useState(false);

  const meta = paymentStatusMeta(order.paymentStatus);
  const payable = canPayOrder(order);
  const onlineEnabled = configQuery.data?.data?.enabled ?? true;
  const payment = stateQuery.data?.data?.payment ?? null;
  const isQris = order.paymentMethodId === 'qris';

  const finish = async () => {
    try {
      await syncPayment.mutateAsync(order.orderNumber);
    } catch {
      // The webhook may simply not have arrived yet. The order query below is
      // refreshed regardless, so the screen shows whatever the server says.
    } finally {
      setBusy(false);
      setRefreshing(false);
      onUpdated?.();
    }
  };

  const handlePay = async () => {
    if (busy) return;

    setError('');
    setBusy(true);

    try {
      const { data } = await startPayment.mutateAsync(order.orderNumber);
      const snap = await loadSnap({
        scriptUrl: data.snap.scriptUrl,
        clientKey: data.snap.clientKey,
      });

      openSnapPayment(snap, data.snap.token, {
        onSuccess: finish,
        onPending: finish,
        onError: () => {
          setError('Pembayaran tidak berhasil diproses. Coba lagi atau pilih metode lain.');
          finish();
        },
        onClose: () => {
          // The customer may still finish the payment from the redirect page, so
          // only the server is asked; nothing is assumed here.
          setBusy(false);
          onUpdated?.();
          reconcile();
        },
      });
    } catch (caught) {
      setBusy(false);

      if (caught?.code === 'PAYMENT_NOT_CONFIGURED') {
        setFallback(true);
        return;
      }

      setError(caught?.message ?? 'Pembayaran tidak dapat dimulai. Coba lagi.');
    }
  };

  const paid = order.paymentStatus === 'paid';

  const refreshStatus = () => {
    setRefreshing(true);
    finish();
  };

  /**
   * Reconcile in the background, without touching the button state. Used when
   * the Snap popup closes: the provider has already issued a QRIS code by then,
   * and asking for the status is what makes that code available to this page.
   */
  const reconcile = () => {
    syncPayment.mutateAsync(order.orderNumber).catch(() => {
      // A webhook may not have arrived yet, or the provider may be unreachable.
      // The screen keeps showing the stored state instead of inventing one.
    });
  };

  return (
    <section
      aria-labelledby="panel-pembayaran"
      className={`rounded-card border border-sand bg-surface p-5 ${className ?? ''}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="panel-pembayaran" className="font-display text-heading text-ink">
            Pembayaran
          </h2>
          <p className="mt-1 text-spec text-ink-soft">{order.paymentMethod}</p>
        </div>
        <PaymentStatusBadge status={order.paymentStatus} />
      </div>

      <p className="mt-3 text-sm leading-relaxed text-ink-soft">{meta.description}</p>

      {paid ? (
        <p className="mt-4 flex items-start gap-2 border-t border-sand pt-3 text-spec text-success">
          <FiCheckCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Pembayaran terverifikasi. Kami siapkan pesananmu di workshop Banjarmasin.
        </p>
      ) : null}

      {!paid && order.status === 'cancelled' ? (
        <p className="mt-4 border-t border-sand pt-3 text-spec text-ink-soft">
          Pesanan ini sudah dibatalkan, jadi tidak ada pembayaran yang perlu diselesaikan.
        </p>
      ) : null}

      {!paid && payable && !fallback && onlineEnabled ? (
        <div className="mt-4 border-t border-sand pt-4">
          <Button type="button" fullWidth size="lg" loading={busy} onClick={handlePay}>
            {busy ? (
              'Membuka pembayaran…'
            ) : (
              <>
                <FiCreditCard className="size-4" aria-hidden="true" />
                {order.paymentStatus === 'unpaid' ? 'Bayar sekarang' : 'Lanjutkan pembayaran'}
              </>
            )}
          </Button>

          <p className="mt-3 flex items-start gap-2 text-spec text-ink-soft">
            <FiLock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Pembayaran diproses oleh Midtrans. BaDekor tidak menerima atau menyimpan data kartu.
          </p>

          {order.paymentStatus !== 'unpaid' && !isQris ? (
            <button
              type="button"
              onClick={refreshStatus}
              className="mt-3 inline-flex items-center gap-1.5 text-spec text-ink-soft underline decoration-ink/25 underline-offset-4 transition hover:text-ink"
            >
              <FiRefreshCw className="size-3.5" aria-hidden="true" />
              Sudah bayar? Perbarui status
            </button>
          ) : null}
        </div>
      ) : null}

      {/* The QRIS code is drawn from the stored attempt, so it survives a reload. */}
      {!paid && payable && isQris && !fallback && onlineEnabled ? (
        <QrisPanel
          order={order}
          payment={payment}
          refreshing={refreshing}
          onRefresh={refreshStatus}
        />
      ) : null}

      {error ? (
        <div className="mt-4">
          <FormAlert message={error} />
        </div>
      ) : null}

      {/* Written instructions for manual transfers, and the fallback when the
          server has no payment credentials configured. */}
      {(fallback || !onlineEnabled) && payable ? (
        <div className="mt-4 border-t border-sand pt-4">
          <p className="text-spec text-ink-soft">
            Pembayaran online belum aktif. Ikuti petunjuk berikut, lalu hubungi kami dengan nomor
            pesanan <span className="font-medium text-ink">{order.orderNumber}</span>.
          </p>
          <PaymentInstructions steps={paymentInstructions(order.paymentMethod)} className="mt-3" />
        </div>
      ) : null}
    </section>
  );
}

import { useEffect, useState } from 'react';
import { FiClock, FiRefreshCw, FiSmartphone } from 'react-icons/fi';
import { Button } from '../ui/Button.jsx';
import { PaymentInstructions } from './PaymentInstructions.jsx';
import { formatTime } from '../../lib/format.js';
import { formatRemaining, paymentExpiry } from '../../lib/paymentStatus.js';
import { paymentInstructions } from '../../lib/shipping.js';

/**
 * The QRIS block on the confirmation and order-detail pages.
 *
 * The QR code is **transaction-specific**: Midtrans generates it for one
 * attempt, and the server stores the `generate_qr_code` action URL so the same
 * code can be redrawn after a reload. Nothing here decides payment state —
 * scanning the code, or the countdown reaching zero, is not proof either way:
 * the order stays `pending` until a signature-checked notification (or the
 * `sync` call that asks the provider directly) says otherwise.
 *
 * The countdown is therefore decoration over the stored deadline. When the
 * server has no code yet, the block explains where it appears instead of
 * pretending one exists.
 */
export function QrisPanel({ order, payment, onRefresh, refreshing = false, className }) {
  const attempt = payment?.attempt ?? null;
  const qrCodeUrl = attempt?.qrCodeUrl ?? null;
  const expiresAt = attempt?.expiresAt ?? null;
  const waiting = payment?.status === 'pending';

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return undefined;

    const timer = setInterval(() => setNow(Date.now()), 1_000);

    return () => clearInterval(timer);
  }, [expiresAt]);

  const expiry = paymentExpiry(expiresAt, now);
  const steps = paymentInstructions(order.paymentMethod);

  return (
    <div className={`mt-4 border-t border-sand pt-4 ${className ?? ''}`}>
      <h3 className="flex items-center gap-2 text-sm font-medium text-ink">
        <FiSmartphone className="size-4 text-primary" aria-hidden="true" />
        Bayar dengan QRIS
      </h3>

      {qrCodeUrl ? (
        <div className="mt-3 text-center">
          <img
            src={qrCodeUrl}
            alt={`Kode QRIS untuk pesanan ${order.orderNumber}`}
            width="240"
            height="240"
            className="mx-auto size-60 rounded-card border border-sand bg-white p-2"
          />
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Pindai kode ini dengan aplikasi m-banking atau e-wallet yang mendukung QRIS. Kode ini
            hanya berlaku untuk pesanan{' '}
            <span className="font-medium text-ink">{order.orderNumber}</span>.
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          {waiting
            ? 'Kode QR belum diterbitkan. Tekan “Lanjutkan pembayaran” untuk membuka halaman Midtrans, lalu pindai kode yang muncul di sana.'
            : 'Kode QR dibuat saat kamu menekan “Bayar sekarang”. Kode itu khusus untuk pesanan ini dan hanya bisa dipakai sekali.'}
        </p>
      )}

      {expiry.known ? (
        <p className="mt-3 flex items-start gap-2 text-spec text-ink-soft">
          <FiClock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {expiry.expired ? (
            <span>
              Batas waktu kode QR sudah lewat. Buat pembayaran baru agar Midtrans menerbitkan kode
              yang masih berlaku.
            </span>
          ) : (
            <span>
              Berlaku sampai{' '}
              <span className="tabular font-medium text-ink">{formatTime(expiresAt)}</span> · sisa{' '}
              <span className="tabular">{formatRemaining(expiry)}</span>
            </span>
          )}
        </p>
      ) : null}

      <p className="mt-3 text-spec leading-relaxed text-ink-soft">
        Status pesanan tetap menunggu sampai Midtrans mengonfirmasi pembayaran. Memindai kode atau
        membuka halaman berhasil di browser belum dihitung sebagai pembayaran.
      </p>

      <div className="mt-3">
        <PaymentInstructions steps={steps} />
      </div>

      {onRefresh ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          loading={refreshing}
          onClick={onRefresh}
        >
          <FiRefreshCw className="size-3.5" aria-hidden="true" />
          Sudah bayar? Perbarui status
        </Button>
      ) : null}
    </div>
  );
}

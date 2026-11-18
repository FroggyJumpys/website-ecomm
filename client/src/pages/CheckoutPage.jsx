import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiLock } from 'react-icons/fi';
import { AddressPicker } from '../components/checkout/AddressPicker.jsx';
import { PaymentPicker } from '../components/checkout/PaymentPicker.jsx';
import { ShippingPicker } from '../components/checkout/ShippingPicker.jsx';
import { OrderTotals } from '../components/cart/OrderTotals.jsx';
import { Breadcrumbs } from '../components/ui/Breadcrumbs.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Checkbox } from '../components/ui/Form.jsx';
import { EmptyState, ErrorState } from '../components/ui/EmptyState.jsx';
import { FormAlert } from '../components/ui/FormAlert.jsx';
import { Skeleton } from '../components/ui/Spinner.jsx';
import { useCart } from '../context/cartContext.js';
import { useAddresses, useCreateAddress, useCreateOrder } from '../hooks/useAccount.js';
import { formatIDR } from '../lib/format.js';
import { focusFirstInvalid } from '../lib/focus.js';
import { routes } from '../lib/nav.js';
import { DEFAULT_PAYMENT_ID, DEFAULT_SHIPPING_ID, findShippingOption } from '../lib/shipping.js';
import { validateCheckout } from '../lib/validation.js';

function StepHeading({ step, id, title, description }) {
  return (
    <div className="flex items-start gap-3 border-b border-sand pb-3">
      <span
        aria-hidden="true"
        className="tabular mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-ink/20 text-[0.6875rem] font-medium text-ink"
      >
        {step}
      </span>
      <div>
        <h2 id={id} className="font-display text-heading text-ink">
          {title}
        </h2>
        {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
      </div>
    </div>
  );
}

function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `fallback-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function ReceiptItem({ item }) {
  const variant = [item.color, item.size].filter(Boolean).join(' · ');

  return (
    <li className="flex gap-3 py-3">
      <img
        src={item.image}
        alt=""
        loading="lazy"
        decoding="async"
        className="size-12 shrink-0 rounded-field bg-sand object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-spec font-medium text-ink">{item.name}</p>
        <p className="text-spec text-ink-soft">
          {item.quantity} × {formatIDR(item.price)}
          {variant && ` · ${variant}`}
        </p>
      </div>
      <p className="tabular text-spec text-ink">{formatIDR(item.price * item.quantity)}</p>
    </li>
  );
}

/**
 * Checkout. The left column is the sequence the customer has to complete —
 * address, delivery, payment — and the right column is a running receipt, so
 * the total never leaves the screen while choices above it change the cost.
 */
export function CheckoutPage() {
  const {
    items,
    count,
    subtotal,
    canCheckout,
    refresh,
    isPending: cartPending,
    isError: cartError,
    error: cartErrorObject,
    refetch: refetchCart,
  } = useCart();
  const addressesQuery = useAddresses();
  const createAddress = useCreateAddress();
  const placeOrder = useCreateOrder();
  const navigate = useNavigate();
  const formRef = useRef(null);

  const addresses = addressesQuery.data?.data ?? [];
  const defaultAddress = addresses.find((address) => address.isDefault) ?? addresses[0] ?? null;

  const [selectedId, setSelectedId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [shippingId, setShippingId] = useState(DEFAULT_SHIPPING_ID);
  const [paymentId, setPaymentId] = useState(DEFAULT_PAYMENT_ID);
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedAddress =
    addresses.find((address) => String(address.id) === String(selectedId)) ?? defaultAddress;
  const noSavedAddresses =
    !addressesQuery.isPending && !addressesQuery.isError && addresses.length === 0;
  const showAddressForm = adding || noSavedAddresses;

  const shipping = findShippingOption(shippingId);

  // One key per distinct checkout attempt: a retry after a lost response must
  // reuse it so the server returns the order instead of charging twice, while
  // changing the address or a policy starts a genuinely new attempt.
  const idempotencyKey = useRef(createIdempotencyKey());

  useEffect(() => {
    idempotencyKey.current = createIdempotencyKey();
  }, [selectedAddress?.id, shippingId, paymentId]);

  const handleCreateAddress = async (values) => {
    const payload = await createAddress.mutateAsync(values);

    if (payload?.data) {
      setSelectedId(payload.data.id);
      setAdding(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    const fieldErrors = validateCheckout({
      address: showAddressForm ? null : selectedAddress,
      shippingMethod: shippingId,
      paymentMethod: paymentId,
      terms,
    });

    if (showAddressForm) {
      fieldErrors.address = 'Simpan alamat pengiriman sebelum membuat pesanan.';
    }

    setErrors(fieldErrors);
    setFormError('');

    if (Object.keys(fieldErrors).length > 0) {
      focusFirstInvalid(formRef.current);
      return;
    }

    setSubmitting(true);

    try {
      const { data: order } = await placeOrder.mutateAsync({
        idempotencyKey: idempotencyKey.current,
        addressId: selectedAddress.id,
        shippingMethod: shippingId,
        paymentMethod: paymentId,
      });

      // The order is committed; the cart re-read is background housekeeping and
      // must not turn a successful checkout into an error if the refetch fails.
      void refresh();
      navigate(routes.orderComplete(order.orderNumber), { replace: true });
    } catch (error) {
      setFormError(error.message || 'Pesanan tidak dapat dibuat. Coba lagi.');
      setSubmitting(false);
    }
  };

  if (cartPending) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8" aria-busy="true">
        <Skeleton className="h-4 w-40 rounded-full" />
        <Skeleton className="mt-4 h-9 w-64 rounded-full" />
        <Skeleton className="mt-8 h-64 w-full rounded-card" />
      </div>
    );
  }

  if (cartError) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
        <ErrorState
          description={cartErrorObject?.message ?? 'Keranjang tidak dapat dimuat.'}
          onRetry={refetchCart}
          className="py-20"
        />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
        <EmptyState
          title="Belum ada yang perlu dibayar"
          description="Keranjangmu kosong. Pilih produk dulu, lalu kembali ke halaman ini untuk menyelesaikan pesanan."
          action={{ label: 'Lihat koleksi', to: routes.shop }}
          className="py-20"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-8">
      <Breadcrumbs
        items={[
          { label: 'Beranda', to: routes.home },
          { label: 'Keranjang', to: routes.cart },
          { label: 'Pembayaran' },
        ]}
      />

      <header className="mt-6 max-w-xl border-b border-sand pb-6">
        <h1 className="text-title text-ink">Pembayaran</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Tiga langkah lagi. Alamat dan metode bisa diubah kapan saja sebelum pesanan dibuat.
        </p>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-14">
        <div className="space-y-10">
          <section aria-labelledby="langkah-alamat">
            <StepHeading
              step="1"
              id="langkah-alamat"
              title="Alamat pengiriman"
              description="Kami mengirim ke alamat ini sesuai data yang tersimpan di akunmu."
            />

            {errors.address && (
              <div className="mt-4">
                <FormAlert message={errors.address} />
              </div>
            )}

            <div className="mt-5">
              {addressesQuery.isError ? (
                <ErrorState
                  className="py-8"
                  description="Alamat tersimpan tidak dapat dimuat. Kamu masih bisa mengisi alamat baru."
                  onRetry={addressesQuery.refetch}
                />
              ) : (
                <AddressPicker
                  addresses={addresses}
                  selectedId={selectedAddress?.id ?? ''}
                  onSelect={setSelectedId}
                  loading={addressesQuery.isPending}
                  adding={showAddressForm}
                  onStartAdding={() => setAdding(true)}
                  onCancelAdding={() => setAdding(false)}
                  onCreate={handleCreateAddress}
                  creating={createAddress.isPending}
                />
              )}
            </div>
          </section>

          <form
            id="form-pembayaran"
            ref={formRef}
            onSubmit={handleSubmit}
            noValidate
            className="space-y-10"
          >
            <section aria-labelledby="langkah-pengiriman">
              <StepHeading
                step="2"
                id="langkah-pengiriman"
                title="Metode pengiriman"
                description="Sofa, lemari, dan meja makan besar dikirim dengan kargo agar tidak rusak di jalan."
              />
              <div className="mt-5">
                <ShippingPicker value={shippingId} onChange={setShippingId} />
              </div>
            </section>

            <section aria-labelledby="langkah-pembayaran">
              <StepHeading
                step="3"
                id="langkah-pembayaran"
                title="Pembayaran"
                description="Pilih cara bayar. Instruksi lengkap muncul di halaman konfirmasi."
              />
              <div className="mt-5">
                <PaymentPicker value={paymentId} onChange={setPaymentId} />
              </div>
            </section>
          </form>
        </div>

        <aside className="lg:sticky lg:top-36">
          <div className="rounded-card border border-sand bg-surface p-5 sm:p-6">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-heading text-ink">Pesananmu</h2>
              <span className="tabular text-spec text-ink-soft">{count} barang</span>
            </div>

            <ul className="mt-2 divide-y divide-sand/70 border-b border-sand">
              {items.map((item) => (
                <ReceiptItem key={item.key} item={item} />
              ))}
            </ul>

            <OrderTotals subtotal={subtotal} shippingCost={shipping.cost} className="mt-4" />

            <p className="mt-3 text-spec text-ink-soft">
              {shipping.label} · {shipping.estimate}
            </p>

            <div className="mt-5 border-t border-sand pt-4">
              <Checkbox
                id="setuju-syarat"
                name="terms"
                checked={terms}
                onChange={(event) => {
                  setTerms(event.target.checked);
                  setErrors((current) => {
                    if (!current.terms) return current;
                    const next = { ...current };
                    delete next.terms;
                    return next;
                  });
                }}
                aria-invalid={errors.terms ? 'true' : undefined}
                error={errors.terms}
                label={<>Saya menyetujui syarat pemesanan dan kebijakan pengembalian BaDekor.</>}
              />
            </div>

            {formError && (
              <div className="mt-4">
                <FormAlert message={formError} />
              </div>
            )}

            {!canCheckout && (
              <div className="mt-4">
                <FormAlert message="Ada barang di keranjang yang perlu diperbaiki sebelum pesanan dibuat. Buka keranjang untuk melihatnya." />
              </div>
            )}

            <Button
              type="submit"
              form="form-pembayaran"
              size="lg"
              fullWidth
              loading={submitting}
              disabled={!canCheckout}
              className="mt-4"
            >
              <FiLock className="size-4" aria-hidden="true" />
              {submitting
                ? 'Membuat pesanan…'
                : `Buat pesanan · ${formatIDR(subtotal + shipping.cost)}`}
            </Button>

            <p className="mt-3 flex items-start gap-2 text-spec text-ink-soft">
              Pembayaran diproses melalui kanal resmi. BaDekor tidak menyimpan data kartu.
            </p>
          </div>

          <Link
            to={routes.cart}
            className="mt-4 inline-flex items-center gap-1.5 px-1 text-sm text-ink-soft transition hover:text-ink"
          >
            <FiArrowLeft className="size-4" aria-hidden="true" />
            Kembali ke keranjang
          </Link>
        </aside>
      </div>
    </div>
  );
}

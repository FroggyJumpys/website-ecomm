import { FiPlus } from 'react-icons/fi';
import { AddressForm } from '../account/AddressForm.jsx';
import { Badge } from '../ui/Badge.jsx';
import { Button } from '../ui/Button.jsx';
import { RadioCard } from '../ui/RadioCard.jsx';
import { Skeleton } from '../ui/Spinner.jsx';

function AddressSummary({ address }) {
  return (
    <span className="mt-1.5 block space-y-0.5 text-spec text-ink-soft">
      <span className="block">{address.street}</span>
      <span className="block">
        {address.district}, {address.city}
      </span>
      <span className="tabular block">
        {address.province} {address.postalCode} · {address.phone}
      </span>
      {address.notes && <span className="block text-ink-soft/80">{address.notes}</span>}
    </span>
  );
}

/**
 * Shipping address choice at checkout. Saved addresses are selectable cards;
 * a new address is created inline through the same form the account pages use,
 * so the user does not lose the cart to go and add one.
 */
export function AddressPicker({
  addresses,
  selectedId,
  onSelect,
  loading,
  adding,
  onStartAdding,
  onCancelAdding,
  onCreate,
  creating,
}) {
  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-20 w-full rounded-field" />
        <Skeleton className="h-20 w-full rounded-field" />
      </div>
    );
  }

  if (adding) {
    return (
      <div className="rounded-card border border-sand bg-surface p-5">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-heading text-ink">Alamat pengiriman baru</h3>
            <p className="mt-1 text-sm text-ink-soft">
              Alamat ini disimpan ke akunmu setelah pesanan dibuat.
            </p>
          </div>
          {addresses.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onCancelAdding} disabled={creating}>
              Batal
            </Button>
          )}
        </div>
        <AddressForm onSubmit={onCreate} onCancel={onCancelAdding} submitting={creating} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {addresses.map((address) => {
        const checked = String(address.id) === String(selectedId);

        return (
          <RadioCard
            key={address.id}
            name="alamat-pengiriman"
            value={address.id}
            checked={checked}
            onChange={() => onSelect(address.id)}
            title={address.recipient}
            meta={
              <span className="flex items-center gap-2 text-spec text-ink-soft">
                <span>{address.label}</span>
                {address.isDefault && <Badge tone="neutral">Utama</Badge>}
              </span>
            }
          >
            <AddressSummary address={address} />
          </RadioCard>
        );
      })}

      <Button variant="outline" size="sm" onClick={onStartAdding}>
        <FiPlus className="size-4" aria-hidden="true" />
        Kirim ke alamat lain
      </Button>
    </div>
  );
}

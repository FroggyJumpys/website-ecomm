import { Badge } from '../ui/Badge.jsx';
import { cn } from '../../lib/cn.js';

/**
 * Read view of one saved address. Repeated objects are exactly when a card is
 * the right container, so addresses use one; it is the only repeated surface in
 * the account area.
 */
export function AddressCard({ address, onEdit, onDelete, onSetDefault, settingDefault }) {
  return (
    <article
      className={cn(
        'flex flex-col rounded-card border bg-surface p-5',
        address.isDefault ? 'border-ink/25 shadow-card' : 'border-sand'
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-sm font-medium text-ink">{address.label}</p>
        {address.isDefault && <Badge tone="dark">Alamat utama</Badge>}
      </div>

      <div className="mt-3 space-y-1 text-sm">
        <p className="font-medium text-ink">{address.recipient}</p>
        <p className="text-ink-soft">{address.phone}</p>
        <p className="text-ink-soft">{address.street}</p>
        <p className="text-ink-soft">
          {address.district}, {address.city}
        </p>
        <p className="text-ink-soft">
          {address.province} {address.postalCode}
        </p>
        {address.notes && <p className="text-spec text-ink-soft/80">Catatan: {address.notes}</p>}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-5 text-sm">
        <button
          type="button"
          onClick={() => onEdit(address)}
          className="font-medium text-ink hover:text-primary-deep"
        >
          Ubah
        </button>
        {!address.isDefault && (
          <button
            type="button"
            onClick={() => onSetDefault(address)}
            disabled={settingDefault}
            className="text-ink-soft transition hover:text-ink disabled:opacity-50"
          >
            Jadikan utama
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(address)}
          className="ml-auto text-ink-soft transition hover:text-danger"
        >
          Hapus
        </button>
      </div>
    </article>
  );
}

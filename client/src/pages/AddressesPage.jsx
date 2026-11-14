import { useState } from 'react';
import { FiPlus } from 'react-icons/fi';
import { AccountPageHeader } from '../components/account/AccountPageHeader.jsx';
import { AddressCard } from '../components/account/AddressCard.jsx';
import { AddressForm } from '../components/account/AddressForm.jsx';
import { Button } from '../components/ui/Button.jsx';
import { ErrorState } from '../components/ui/EmptyState.jsx';
import { FormAlert } from '../components/ui/FormAlert.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { Skeleton } from '../components/ui/Spinner.jsx';
import {
  useAddresses,
  useCreateAddress,
  useDeleteAddress,
  useSetDefaultAddress,
  useUpdateAddress,
} from '../hooks/useAccount.js';

function AddressGridSkeleton() {
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2" aria-busy="true">
      {Array.from({ length: 2 }).map((_, index) => (
        <Skeleton key={index} className="h-56 rounded-card" />
      ))}
    </div>
  );
}

export function AddressesPage() {
  const query = useAddresses();
  const createMutation = useCreateAddress();
  const updateMutation = useUpdateAddress();
  const deleteMutation = useDeleteAddress();
  const defaultMutation = useSetDefaultAddress();

  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState('');

  const addresses = query.data?.data ?? [];
  const editingAddress = editing === 'new' ? null : editing;

  const closeEditor = () => setEditing(null);

  const handleSubmit = async (values) => {
    if (editing === 'new') {
      await createMutation.mutateAsync(values);
    } else {
      await updateMutation.mutateAsync({ id: editing.id, ...values });
    }

    closeEditor();
  };

  const closeDelete = () => {
    setDeleting(null);
    setDeleteError('');
  };

  const confirmDelete = async () => {
    setDeleteError('');

    try {
      await deleteMutation.mutateAsync(deleting.id);
      closeDelete();
    } catch (error) {
      setDeleteError(error.message || 'Alamat tidak dapat dihapus. Coba lagi.');
    }
  };

  let content;

  if (query.isPending) {
    content = <AddressGridSkeleton />;
  } else if (query.isError) {
    content = (
      <ErrorState
        description="Alamat tidak dapat dimuat."
        onRetry={query.refetch}
        className="py-12"
      />
    );
  } else if (addresses.length === 0) {
    content = (
      <div className="mt-8 rounded-card border border-dashed border-ink/20 bg-surface px-6 py-12 text-center">
        <h2 className="font-display text-heading text-ink">Belum ada alamat tersimpan</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
          Tambahkan alamat pengiriman agar checkout berikutnya tidak perlu mengisi ulang.
        </p>
        <Button className="mt-5" onClick={() => setEditing('new')}>
          Tambah alamat
        </Button>
      </div>
    );
  } else {
    content = (
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {addresses.map((address) => (
          <AddressCard
            key={address.id}
            address={address}
            onEdit={setEditing}
            onDelete={setDeleting}
            onSetDefault={(item) => defaultMutation.mutate(item.id)}
            settingDefault={defaultMutation.isPending && defaultMutation.variables === address.id}
          />
        ))}

        <button
          type="button"
          onClick={() => setEditing('new')}
          className="flex min-h-44 flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-ink/20 p-6 text-sm text-ink-soft transition hover:border-ink/40 hover:bg-ink/2 hover:text-ink"
        >
          <FiPlus className="size-5" aria-hidden="true" />
          <span className="font-medium">Tambah alamat</span>
          <span className="text-spec">Rumah, kantor, atau alamat hadiah</span>
        </button>
      </div>
    );
  }

  return (
    <div>
      <AccountPageHeader
        title="Alamat pengiriman"
        description="Simpan alamat yang sering dipakai. Alamat utama dipakai lebih dulu saat checkout."
        action={
          <Button size="sm" onClick={() => setEditing('new')}>
            <FiPlus className="size-4" aria-hidden="true" />
            Tambah alamat
          </Button>
        }
      />

      {content}

      <Modal
        open={editing !== null}
        onClose={closeEditor}
        title={editing === 'new' ? 'Tambah alamat' : 'Ubah alamat'}
      >
        {editing !== null && (
          <AddressForm
            key={editing === 'new' ? 'new' : editing.id}
            address={editingAddress}
            onSubmit={handleSubmit}
            onCancel={closeEditor}
            submitting={createMutation.isPending || updateMutation.isPending}
          />
        )}
      </Modal>

      <Modal
        open={Boolean(deleting)}
        onClose={closeDelete}
        title="Hapus alamat?"
        className="max-w-md"
      >
        <p className="text-sm leading-relaxed text-ink-soft">
          Alamat <span className="font-medium text-ink">{deleting?.label}</span> akan dihapus dari
          daftar. Pesanan yang sudah berjalan tidak terpengaruh.
        </p>

        {deleteError && (
          <div className="mt-4">
            <FormAlert message={deleteError} />
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            className="bg-danger hover:bg-danger/90"
            loading={deleteMutation.isPending}
            onClick={confirmDelete}
          >
            {deleteMutation.isPending ? 'Menghapus…' : 'Hapus alamat'}
          </Button>
          <Button variant="ghost" onClick={closeDelete} disabled={deleteMutation.isPending}>
            Batal
          </Button>
        </div>
      </Modal>
    </div>
  );
}

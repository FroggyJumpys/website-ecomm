import { useState } from 'react';
import { FiEdit3, FiPlus, FiTrash2 } from 'react-icons/fi';
import { Button } from '../ui/Button.jsx';
import { Drawer } from '../ui/Drawer.jsx';
import { ErrorState } from '../ui/EmptyState.jsx';
import { Skeleton } from '../ui/Spinner.jsx';
import { DeleteConfirm } from './DeleteConfirm.jsx';
import { TaxonomyForm } from './TaxonomyForm.jsx';
import { useTaxonomyMutations } from '../../hooks/useAdmin.js';
import { cn } from '../../lib/cn.js';

const iconAction =
  'grid size-8 place-items-center rounded-full text-ink-soft transition hover:bg-ink/5 hover:text-ink ' +
  'disabled:opacity-50';

const copy = {
  category: {
    noun: 'kategori',
    title: 'Kategori',
    addLabel: 'Tambah kategori',
    emptyTitle: 'Belum ada kategori',
    emptyBody: 'Kategori dipakai filter di halaman koleksi dan dikelompokkan di beranda.',
    deleteBody:
      'Kategori hilang dari filter toko. Produk yang masih memakainya harus dipindahkan lebih dulu.',
  },
  brand: {
    noun: 'merek',
    title: 'Merek',
    addLabel: 'Tambah merek',
    emptyTitle: 'Belum ada merek',
    emptyBody: 'Merek tampil di halaman produk dan dipakai sebagai filter koleksi.',
    deleteBody:
      'Merek hilang dari filter toko. Produk yang masih memakainya harus dipindahkan lebih dulu.',
  },
};

/**
 * Category and brand management share one panel: the table is the same shape,
 * the form already knows which extra fields a category has, and the delete rule
 * (refuse while products still point at it) is identical.
 */
function deleteMessage(error) {
  if (error.code === 'TAXONOMY_IN_USE') {
    return `${error.message} Pindahkan produknya ke ${error.details?.taxonomy === 'brand' ? 'merek lain' : 'kategori lain'} lewat tab Produk.`;
  }

  return error.message || 'Data tidak dapat dihapus.';
}

export function TaxonomyPanel({ kind, query }) {
  const { create, update, remove } = useTaxonomyMutations(kind);
  const text = copy[kind];

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState('');

  const items =
    kind === 'category' ? (query.data?.data?.categories ?? []) : (query.data?.data?.brands ?? []);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const handleSubmit = async (payload) => {
    if (editing) {
      await update.mutateAsync({ id: editing.id, ...payload });
    } else {
      await create.mutateAsync(payload);
    }

    closeForm();
  };

  const handleDelete = async () => {
    setDeleteError('');

    try {
      await remove.mutateAsync(deleting.id);
      setDeleting(null);
    } catch (error) {
      setDeleteError(deleteMessage(error));
    }
  };

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {!query.isPending && !query.isError && (
          <p className="text-spec text-ink-soft">
            <span className="tabular">{items.length}</span> {text.noun}
          </p>
        )}
        <Button size="sm" className="ml-auto" onClick={openCreate}>
          <FiPlus className="size-4" aria-hidden="true" />
          {text.addLabel}
        </Button>
      </div>

      {query.isPending && (
        <div className="mt-6 space-y-3" aria-busy="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full rounded-field" />
          ))}
        </div>
      )}

      {query.isError && (
        <ErrorState
          className="py-12"
          description={`Daftar ${text.noun} tidak dapat dimuat.`}
          onRetry={query.refetch}
        />
      )}

      {!query.isPending && !query.isError && items.length === 0 && (
        <div className="mt-6 border-y border-sand py-12 text-center">
          <h2 className="font-display text-heading text-ink">{text.emptyTitle}</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">{text.emptyBody}</p>
          <Button size="sm" className="mt-4" onClick={openCreate}>
            {text.addLabel}
          </Button>
        </div>
      )}

      {!query.isPending && !query.isError && items.length > 0 && (
        <div className="mt-6 min-w-0 overflow-x-auto">
          <table className="w-full min-w-[17rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-sand text-left">
                <th scope="col" className="py-2 pr-4 text-spec font-normal text-ink-soft">
                  {text.title}
                </th>
                <th
                  scope="col"
                  className="hidden py-2 pr-4 text-spec font-normal text-ink-soft sm:table-cell"
                >
                  Slug
                </th>
                <th scope="col" className="py-2 pr-4 text-spec font-normal text-ink-soft">
                  Produk
                </th>
                <th scope="col" className="py-2 text-right text-spec font-normal text-ink-soft">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-sand/70 last:border-b-0">
                  <td className="py-3 pr-4">
                    <p className="text-sm font-medium text-ink">{item.name}</p>
                    {kind === 'category' && item.description && (
                      <p className="mt-0.5 max-w-md truncate text-spec text-ink-soft">
                        {item.description}
                      </p>
                    )}
                  </td>
                  <td className="hidden py-3 pr-4 text-spec text-ink-soft sm:table-cell">
                    {item.slug}
                  </td>
                  <td className="tabular py-3 pr-4 text-sm text-ink">{item.productCount}</td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        aria-label={`Ubah ${item.name}`}
                        title={`Ubah ${text.noun}`}
                        className={iconAction}
                      >
                        <FiEdit3 className="size-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(item)}
                        aria-label={`Hapus ${item.name}`}
                        title={`Hapus ${text.noun}`}
                        className={cn(iconAction, 'hover:text-danger')}
                      >
                        <FiTrash2 className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer
        open={formOpen}
        onClose={closeForm}
        title={editing ? `Ubah ${text.noun}` : `${text.title} baru`}
        className="max-w-md"
        footer={
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              form="form-taxonomy"
              loading={create.isPending || update.isPending}
            >
              {editing ? 'Simpan perubahan' : text.addLabel}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={closeForm}
              disabled={create.isPending || update.isPending}
            >
              Batal
            </Button>
          </div>
        }
      >
        <TaxonomyForm
          key={editing?.id ?? 'new'}
          kind={kind}
          item={editing}
          submitting={create.isPending || update.isPending}
          onSubmit={handleSubmit}
        />
      </Drawer>

      <DeleteConfirm
        open={Boolean(deleting)}
        title={deleting ? `Hapus ${deleting.name}?` : `Hapus ${text.noun}?`}
        description={text.deleteBody}
        busy={remove.isPending}
        error={deleteError}
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleting(null);
          setDeleteError('');
        }}
      />
    </div>
  );
}

import { useState } from 'react';
import { FiEdit3, FiPlus, FiSearch, FiTrash2 } from 'react-icons/fi';
import { Badge } from '../ui/Badge.jsx';
import { Button } from '../ui/Button.jsx';
import { Drawer } from '../ui/Drawer.jsx';
import { ErrorState } from '../ui/EmptyState.jsx';
import { Skeleton } from '../ui/Spinner.jsx';
import { DeleteConfirm } from './DeleteConfirm.jsx';
import { ProductForm } from './ProductForm.jsx';
import { useCreateProduct, useDeleteProduct, useUpdateProduct } from '../../hooks/useAdmin.js';
import { formatIDR } from '../../lib/format.js';
import { stockStatus } from '../../lib/stock.js';
import { cn } from '../../lib/cn.js';

const iconAction =
  'grid size-8 place-items-center rounded-full text-ink-soft transition hover:bg-ink/5 hover:text-ink ' +
  'disabled:opacity-50';

function ProductRows({ products, onEdit, onDelete }) {
  return products.map((product) => {
    const status = stockStatus(product.stock);

    return (
      <tr key={product.id} className="border-b border-sand/70 last:border-b-0">
        <td className="py-3 pr-4">
          <div className="flex items-center gap-3">
            <img
              src={product.images?.[0]}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-10 shrink-0 rounded-field bg-sand object-cover"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{product.name}</p>
              <p className="truncate text-spec text-ink-soft">{product.slug}</p>
            </div>
          </div>
        </td>

        <td className="hidden py-3 pr-4 text-sm text-ink-soft lg:table-cell">
          {product.category?.name ?? '—'}
        </td>

        <td className="tabular hidden py-3 pr-4 text-sm text-ink sm:table-cell">
          {formatIDR(product.price)}
        </td>

        <td className="py-3 pr-4">
          <span
            className={cn(
              'tabular text-sm',
              status === 'out' ? 'text-danger' : status === 'low' ? 'text-warning' : 'text-ink'
            )}
          >
            {product.stock}
          </span>
        </td>

        <td className="hidden py-3 pr-4 md:table-cell">
          {product.isActive === false ? (
            <Badge tone="neutral">Disembunyikan</Badge>
          ) : (
            <span className="text-spec text-ink-soft">Tampil</span>
          )}
        </td>

        <td className="py-3 text-right">
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => onEdit(product)}
              aria-label={`Ubah ${product.name}`}
              title="Ubah produk"
              className={iconAction}
            >
              <FiEdit3 className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(product)}
              aria-label={`Hapus ${product.name}`}
              title="Hapus produk"
              className={cn(iconAction, 'hover:text-danger')}
            >
              <FiTrash2 className="size-4" aria-hidden="true" />
            </button>
          </div>
        </td>
      </tr>
    );
  });
}

/** Product list, its create/edit drawer and the delete confirmation. */
export function ProductsPanel({ query, categories, brands }) {
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const [term, setTerm] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState('');

  const products = query.data?.data ?? [];
  const canCreate = categories.length > 0 && brands.length > 0;
  const needle = term.trim().toLowerCase();
  const filtered = needle
    ? products.filter((product) =>
        `${product.name} ${product.slug} ${product.category?.name ?? ''} ${product.brand?.name ?? ''}`
          .toLowerCase()
          .includes(needle)
      )
    : products;

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (product) => {
    setEditing(product);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const handleSubmit = async (payload) => {
    if (editing) {
      await updateProduct.mutateAsync({ id: editing.id, ...payload });
    } else {
      await createProduct.mutateAsync(payload);
    }

    closeForm();
  };

  const handleDelete = async () => {
    setDeleteError('');

    try {
      await deleteProduct.mutateAsync(deleting.id);
      setDeleting(null);
    } catch (error) {
      setDeleteError(error.message || 'Produk tidak dapat dihapus.');
    }
  };

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <FiSearch
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft"
          />
          <input
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Cari nama, slug, kategori"
            aria-label="Cari produk"
            className="h-10 w-full rounded-full border border-ink/15 bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-ink-soft/70 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-hidden"
          />
        </div>

        {!query.isPending && !query.isError && (
          <p className="text-spec text-ink-soft">
            <span className="tabular">{filtered.length}</span>
            {needle ? ` dari ${products.length}` : ''} produk
          </p>
        )}

        <Button size="sm" className="ml-auto" onClick={openCreate} disabled={!canCreate}>
          <FiPlus className="size-4" aria-hidden="true" />
          Tambah produk
        </Button>
      </div>

      {!canCreate && !query.isPending && (
        <p className="mt-3 text-spec text-warning">
          Kategori dan merek belum termuat, jadi produk baru belum bisa dibuat.
        </p>
      )}

      {query.isPending && (
        <div className="mt-6 space-y-3" aria-busy="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full rounded-field" />
          ))}
        </div>
      )}

      {query.isError && (
        <ErrorState
          className="py-12"
          description="Daftar produk tidak dapat dimuat."
          onRetry={query.refetch}
        />
      )}

      {!query.isPending && !query.isError && products.length === 0 && (
        <div className="mt-6 border-y border-sand py-12 text-center">
          <h2 className="font-display text-heading text-ink">Belum ada produk</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
            Produk yang kamu tambahkan akan langsung muncul di halaman koleksi toko.
          </p>
          <Button size="sm" className="mt-4" onClick={openCreate} disabled={!canCreate}>
            Tambah produk pertama
          </Button>
        </div>
      )}

      {!query.isPending && !query.isError && products.length > 0 && filtered.length === 0 && (
        <div className="mt-6 border-y border-sand py-10 text-center">
          <p className="text-sm text-ink-soft">
            Tidak ada produk yang cocok dengan “{term.trim()}”.
          </p>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setTerm('')}>
            Bersihkan pencarian
          </Button>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="mt-6 min-w-0 overflow-x-auto">
          <table className="w-full min-w-[19rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-sand text-left">
                <th scope="col" className="py-2 pr-4 text-spec font-normal text-ink-soft">
                  Produk
                </th>
                <th
                  scope="col"
                  className="hidden py-2 pr-4 text-spec font-normal text-ink-soft lg:table-cell"
                >
                  Kategori
                </th>
                <th
                  scope="col"
                  className="hidden py-2 pr-4 text-spec font-normal text-ink-soft sm:table-cell"
                >
                  Harga
                </th>
                <th scope="col" className="py-2 pr-4 text-spec font-normal text-ink-soft">
                  Stok
                </th>
                <th
                  scope="col"
                  className="hidden py-2 pr-4 text-spec font-normal text-ink-soft md:table-cell"
                >
                  Status
                </th>
                <th scope="col" className="py-2 text-right text-spec font-normal text-ink-soft">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody>
              <ProductRows products={filtered} onEdit={openEdit} onDelete={setDeleting} />
            </tbody>
          </table>
        </div>
      )}

      <Drawer
        open={formOpen}
        onClose={closeForm}
        title={editing ? 'Ubah produk' : 'Produk baru'}
        className="max-w-xl"
        footer={
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              form="form-produk"
              loading={createProduct.isPending || updateProduct.isPending}
            >
              {editing ? 'Simpan perubahan' : 'Tambah produk'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={closeForm}
              disabled={createProduct.isPending || updateProduct.isPending}
            >
              Batal
            </Button>
          </div>
        }
      >
        <ProductForm
          key={editing?.id ?? 'new'}
          product={editing}
          categories={categories}
          brands={brands}
          submitting={createProduct.isPending || updateProduct.isPending}
          onSubmit={handleSubmit}
        />
      </Drawer>

      <DeleteConfirm
        open={Boolean(deleting)}
        title={deleting ? `Hapus ${deleting.name}?` : 'Hapus produk?'}
        description="Produk hilang dari toko dan tidak bisa dibeli lagi. Pesanan lama tetap menyimpan data produk ini."
        busy={deleteProduct.isPending}
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

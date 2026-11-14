import { FiX } from 'react-icons/fi';
import { formatIDR } from '../../lib/format.js';
import { countActiveFilters } from '../../lib/shopParams.js';

/**
 * Chips for every active facet, above the results grid. Each chip removes
 * exactly one filter, and the trailing action clears everything at once.
 */
export function ActiveFilters({ filters, options, onPatch, onClearAll }) {
  const activeCount = countActiveFilters(filters);
  if (activeCount === 0) return null;

  const categoryName = options.categories.find((item) => item.slug === filters.category)?.name;
  const brandName = options.brands.find((item) => item.slug === filters.brand)?.name;

  const chips = [];

  if (filters.search) {
    chips.push({
      key: 'search',
      label: `Pencarian “${filters.search}”`,
      onRemove: () => onPatch({ search: '' }),
    });
  }

  if (filters.category) {
    chips.push({
      key: 'category',
      label: categoryName ?? filters.category,
      onRemove: () => onPatch({ category: '' }),
    });
  }

  if (filters.brand) {
    chips.push({
      key: 'brand',
      label: brandName ?? filters.brand,
      onRemove: () => onPatch({ brand: '' }),
    });
  }

  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    const label =
      filters.minPrice !== undefined && filters.maxPrice !== undefined
        ? `${formatIDR(filters.minPrice)} – ${formatIDR(filters.maxPrice)}`
        : filters.minPrice !== undefined
          ? `Di atas ${formatIDR(filters.minPrice)}`
          : `Di bawah ${formatIDR(filters.maxPrice)}`;

    chips.push({
      key: 'price',
      label,
      onRemove: () => onPatch({ minPrice: undefined, maxPrice: undefined }),
    });
  }

  if (filters.size) {
    chips.push({
      key: 'size',
      label: `Ukuran ${filters.size}`,
      onRemove: () => onPatch({ size: '' }),
    });
  }

  if (filters.color) {
    chips.push({
      key: 'color',
      label: `Warna ${filters.color}`,
      onRemove: () => onPatch({ color: '' }),
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 rounded-full bg-sand/70 py-1 pl-3 pr-1 text-spec text-ink"
        >
          {chip.label}
          <button
            type="button"
            onClick={chip.onRemove}
            aria-label={`Hapus filter ${chip.label}`}
            className="grid size-5 place-items-center rounded-full text-ink-soft transition hover:bg-ink/10 hover:text-ink"
          >
            <FiX className="size-3.5" />
          </button>
        </span>
      ))}

      <button
        type="button"
        onClick={onClearAll}
        className="ml-1 text-spec text-ink-soft underline underline-offset-4 transition hover:text-ink"
      >
        Hapus semua
      </button>
    </div>
  );
}

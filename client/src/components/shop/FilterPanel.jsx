import { useId, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { formatIDR } from '../../lib/format.js';
import { COLOR_SWATCH, countActiveFilters } from '../../lib/shopParams.js';

/**
 * The filter rail. Rendered twice (desktop aside and mobile drawer), so every
 * input id is namespaced with `idPrefix` to keep labels unique in the DOM.
 *
 * Each facet maps to exactly one URL parameter and is a single-select radio
 * group with an explicit "Semua ..." option, which keeps keyboard behaviour
 * native and gives every facet a visible way back to "no filter".
 */

const chipBase =
  'relative inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 ' +
  'text-[0.8125rem] transition has-[:focus-visible]:outline-2 ' +
  'has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary';

function Chip({ name, value, checked, onChange, label, swatch }) {
  return (
    <label
      className={cn(
        chipBase,
        checked
          ? 'border-ink bg-ink text-paper'
          : 'border-ink/15 text-ink-soft hover:border-ink/40 hover:text-ink'
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      {swatch && (
        <span
          aria-hidden="true"
          className={cn(
            'size-3 shrink-0 rounded-full ring-1',
            checked ? 'ring-paper/50' : 'ring-ink/20'
          )}
          style={{ backgroundColor: swatch }}
        />
      )}
      {label}
    </label>
  );
}

function Row({ name, value, checked, onChange, label }) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-field px-2 py-1.5 text-sm transition',
        'hover:bg-ink/4',
        checked ? 'font-medium text-ink' : 'text-ink-soft'
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="size-4 shrink-0 border-ink/25 text-primary focus:ring-primary/30"
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </label>
  );
}

function Group({ title, children }) {
  const headingId = useId();

  return (
    <section className="border-t border-sand py-5 first:border-t-0 first:pt-0">
      <h3 id={headingId} className="mb-2 font-display text-sm font-medium text-ink">
        {title}
      </h3>
      <div role="radiogroup" aria-labelledby={headingId}>
        {children}
      </div>
    </section>
  );
}

function PriceFilter({ minPrice, maxPrice, range, onApply }) {
  const [min, setMin] = useState(minPrice ?? '');
  const [max, setMax] = useState(maxPrice ?? '');
  const minId = useId();
  const maxId = useId();

  const parsedMin = min === '' ? undefined : Number(min);
  const parsedMax = max === '' ? undefined : Number(max);
  const invalid =
    parsedMin !== undefined &&
    parsedMax !== undefined &&
    Number.isFinite(parsedMin) &&
    Number.isFinite(parsedMax) &&
    parsedMin > parsedMax;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (invalid) return;
    onApply({
      minPrice: Number.isFinite(parsedMin) ? parsedMin : undefined,
      maxPrice: Number.isFinite(parsedMax) ? parsedMax : undefined,
    });
  };

  const inputClass =
    'tabular h-10 w-full min-w-0 rounded-field border border-ink/15 bg-surface px-2.5 text-sm ' +
    'text-ink placeholder:text-ink-soft/70 focus:border-primary focus:ring-2 focus:ring-primary/25 ' +
    'focus:outline-hidden';

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5">
      <div className="flex items-center gap-2">
        <label htmlFor={minId} className="sr-only">
          Harga minimum
        </label>
        <input
          id={minId}
          type="number"
          inputMode="numeric"
          min="0"
          step="50000"
          value={min}
          onChange={(event) => setMin(event.target.value)}
          placeholder="Min"
          className={inputClass}
        />
        <span aria-hidden="true" className="text-ink-soft">
          –
        </span>
        <label htmlFor={maxId} className="sr-only">
          Harga maksimum
        </label>
        <input
          id={maxId}
          type="number"
          inputMode="numeric"
          min="0"
          step="50000"
          value={max}
          onChange={(event) => setMax(event.target.value)}
          placeholder="Maks"
          className={inputClass}
        />
      </div>

      {invalid ? (
        <p role="alert" className="text-spec text-danger">
          Harga minimum tidak boleh lebih besar dari harga maksimum.
        </p>
      ) : (
        <p className="tabular text-spec text-ink-soft/90">
          Rentang koleksi {formatIDR(range.min)} – {formatIDR(range.max)}
        </p>
      )}

      <button
        type="submit"
        disabled={invalid}
        className="h-9 w-full rounded-full border border-ink/20 text-[0.8125rem] font-medium text-ink transition hover:border-ink hover:bg-ink/5 disabled:pointer-events-none disabled:opacity-50"
      >
        Terapkan harga
      </button>
    </form>
  );
}

export function FilterPanel({
  filters,
  options,
  onPatch,
  onClearAll,
  idPrefix = 'filter',
  showTitle = true,
}) {
  const activeCount = countActiveFilters(filters);
  const name = (facet) => `${idPrefix}-${facet}`;
  const hasHeader = showTitle || activeCount > 0;

  return (
    <div className="text-ink">
      {hasHeader && (
        <div
          className={cn(
            'flex items-center gap-3 pb-4',
            showTitle ? 'justify-between' : 'justify-end'
          )}
        >
          {showTitle && <p className="font-display text-base font-medium text-ink">Filter</p>}
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-spec text-ink-soft underline underline-offset-4 transition hover:text-ink"
            >
              Hapus semua
            </button>
          )}
        </div>
      )}

      <Group title="Kategori">
        <Row
          name={name('kategori')}
          value=""
          checked={!filters.category}
          onChange={() => onPatch({ category: '' })}
          label="Semua kategori"
        />
        {options.categories.map((category) => (
          <Row
            key={category.slug}
            name={name('kategori')}
            value={category.slug}
            checked={filters.category === category.slug}
            onChange={() => onPatch({ category: category.slug })}
            label={category.name}
          />
        ))}
      </Group>

      <Group title="Merek">
        <Row
          name={name('merek')}
          value=""
          checked={!filters.brand}
          onChange={() => onPatch({ brand: '' })}
          label="Semua merek"
        />
        {options.brands.map((brand) => (
          <Row
            key={brand.slug}
            name={name('merek')}
            value={brand.slug}
            checked={filters.brand === brand.slug}
            onChange={() => onPatch({ brand: brand.slug })}
            label={brand.name}
          />
        ))}
      </Group>

      <Group title="Harga">
        <PriceFilter
          key={`${filters.minPrice ?? ''}-${filters.maxPrice ?? ''}`}
          minPrice={filters.minPrice}
          maxPrice={filters.maxPrice}
          range={options.priceRange}
          onApply={onPatch}
        />
      </Group>

      <Group title="Ukuran">
        <div className="flex flex-wrap gap-1.5">
          <Chip
            name={name('ukuran')}
            value=""
            checked={!filters.size}
            onChange={() => onPatch({ size: '' })}
            label="Semua"
          />
          {options.sizes.map((size) => (
            <Chip
              key={size}
              name={name('ukuran')}
              value={size}
              checked={filters.size === size}
              onChange={() => onPatch({ size })}
              label={size}
            />
          ))}
        </div>
      </Group>

      <Group title="Warna">
        <div className="flex flex-wrap gap-1.5">
          <Chip
            name={name('warna')}
            value=""
            checked={!filters.color}
            onChange={() => onPatch({ color: '' })}
            label="Semua"
          />
          {options.colors.map((color) => (
            <Chip
              key={color}
              name={name('warna')}
              value={color}
              checked={filters.color === color}
              onChange={() => onPatch({ color })}
              label={color}
              swatch={COLOR_SWATCH[color] ?? '#c9c1b5'}
            />
          ))}
        </div>
      </Group>
    </div>
  );
}

/** Placeholder rail with the same rhythm, so the grid does not jump in. */
export function FilterPanelSkeleton() {
  const widths = ['w-24', 'w-36', 'w-32', 'w-40'];

  return (
    <div aria-hidden="true" className="space-y-6">
      {[0, 1, 2].map((group) => (
        <div
          key={group}
          className="space-y-2.5 border-t border-sand pt-5 first:border-t-0 first:pt-0"
        >
          <div className="h-4 w-20 animate-pulse rounded-full bg-sand/70" />
          {widths.map((width, index) => (
            <div key={index} className={cn('h-3.5 animate-pulse rounded-full bg-sand/60', width)} />
          ))}
        </div>
      ))}
    </div>
  );
}

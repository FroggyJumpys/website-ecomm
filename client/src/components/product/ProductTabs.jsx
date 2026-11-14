import { useId, useRef, useState } from 'react';
import { cn } from '../../lib/cn.js';

const TABS = [
  { id: 'deskripsi', label: 'Deskripsi' },
  { id: 'spesifikasi', label: 'Spesifikasi' },
  { id: 'pengiriman', label: 'Pengiriman & perawatan' },
];

function Description({ product }) {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-ink-soft">
      <p className="text-ink">{product.description}</p>
      <p>
        Setiap unit dibuat di workshop BaDekor di Banjarmasin dari ulin kering tanur, dikerjakan
        oleh pengrajin yang sama dari pemotongan sampai finishing. Karena bahan alami, urat dan
        warna kayu tiap unit sedikit berbeda dari foto.
      </p>
      <p>
        Perawatan cukup dengan kain lembap. Hindari pemutih dan paparan sinar matahari langsung
        dalam waktu lama agar finishing minyak tetap rata.
      </p>
    </div>
  );
}

function Specifications({ product }) {
  const rows = [
    ['Material', product.material],
    ['Dimensi', product.dimensions],
    ['Warna tersedia', product.colors?.length ? product.colors.join(', ') : null],
    ['Ukuran', product.sizes?.length ? product.sizes.join(', ') : 'Ukuran standar'],
    ['Merek', product.brand?.name],
    ['Kategori', product.category?.name],
  ].filter(([, value]) => Boolean(value));

  return (
    <dl className="divide-y divide-sand border-y border-sand text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
          <dt className="text-ink-soft">{label}</dt>
          <dd className="text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const shippingPoints = [
  'Dikirim dari Banjarmasin. Estimasi 3–7 hari untuk Kalimantan dan 7–14 hari untuk luar Kalimantan.',
  'Perakitan di rumah tersedia untuk Banjarmasin dan sekitarnya. Di luar area itu, rangka dikirim dengan petunjuk perakitan.',
  'Garansi rangka ulin lima tahun. Simpan nota pembelian sebagai bukti klaim.',
  'Rawat dengan kain lembap, hindari pemutih, dan jangan menaruh unit di bawah sinar matahari langsung.',
];

function Shipping() {
  return (
    <ul className="space-y-3 text-sm leading-relaxed text-ink-soft">
      {shippingPoints.map((point) => (
        <li key={point} className="flex gap-3">
          <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
          {point}
        </li>
      ))}
    </ul>
  );
}

/**
 * Product information as tabs instead of one long page of copy. Tabs follow the
 * WAI-ARIA tabs pattern: roving tabindex, arrow/Home/End keys, and one panel
 * per tab (only the selected one is visible).
 */
export function ProductTabs({ product, className }) {
  const [active, setActive] = useState(TABS[0].id);
  const tabRefs = useRef([]);
  const baseId = useId();

  const moveTo = (index) => {
    const next = (index + TABS.length) % TABS.length;
    setActive(TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  const onKeyDown = (event, index) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveTo(index + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveTo(index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      moveTo(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      moveTo(TABS.length - 1);
    }
  };

  return (
    <section className={cn('border-t border-sand pt-8', className)}>
      <div
        role="tablist"
        aria-label="Informasi produk"
        className="flex flex-wrap gap-x-8 border-b border-sand"
      >
        {TABS.map((tab, index) => {
          const selected = tab.id === active;

          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                '-mb-px border-b-2 pb-3 text-sm transition',
                selected
                  ? 'border-ink font-medium text-ink'
                  : 'border-transparent text-ink-soft hover:text-ink'
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="pt-6">
        {TABS.map((tab) => (
          <div
            key={tab.id}
            role="tabpanel"
            id={`${baseId}-panel-${tab.id}`}
            aria-labelledby={`${baseId}-tab-${tab.id}`}
            tabIndex={0}
            hidden={tab.id !== active}
            className="max-w-3xl outline-hidden"
          >
            {tab.id === 'deskripsi' && <Description product={product} />}
            {tab.id === 'spesifikasi' && <Specifications product={product} />}
            {tab.id === 'pengiriman' && <Shipping />}
          </div>
        ))}
      </div>
    </section>
  );
}

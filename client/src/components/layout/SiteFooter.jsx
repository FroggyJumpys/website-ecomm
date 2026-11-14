import { Link } from 'react-router-dom';
import { FaInstagram, FaWhatsapp } from 'react-icons/fa6';
import { routes } from '../../lib/nav.js';

const columns = [
  {
    title: 'Koleksi',
    links: [
      { label: 'Sofa & kursi panjang', to: `${routes.shop}?kategori=sofa` },
      { label: 'Meja makan', to: `${routes.shop}?kategori=meja-makan` },
      { label: 'Kursi', to: `${routes.shop}?kategori=kursi` },
      { label: 'Tempat tidur', to: `${routes.shop}?kategori=tempat-tidur` },
      { label: 'Lemari & rak', to: `${routes.shop}?kategori=lemari-rak` },
    ],
  },
  {
    title: 'Bantuan',
    links: [
      { label: 'Pengiriman antar pulau', to: routes.shop },
      { label: 'Perakitan di rumah', to: routes.shop },
      { label: 'Garansi & perawatan', to: routes.shop },
      { label: 'Lacak pesanan', to: routes.account },
    ],
  },
  {
    title: 'Workshop',
    links: [
      { label: 'Cerita BaDekor', to: routes.home },
      { label: 'Cara kami memilih ulin', to: routes.home },
      { label: 'Kunjungi workshop', to: routes.home },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 bg-ulin text-paper/75">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-4">
          <p className="font-display text-xl font-semibold tracking-[-0.04em] text-paper">BaDekor</p>
          <p className="max-w-xs text-sm leading-relaxed">
            Mebel dari kayu ulin dan rotan, dibuat bersama pengrajin di bantaran Sungai Martapura.
          </p>
          <address className="space-y-1 text-sm not-italic">
            <p>Jl. Pierre Tendean No. 12, Banjarmasin</p>
            <p>Kalimantan Selatan 70231</p>
          </address>
          <div className="flex items-center gap-3 pt-1">
            <a
              href="https://wa.me/6281100000000"
              className="grid size-9 place-items-center rounded-full border border-paper/20 text-paper transition hover:border-paper/50"
              aria-label="WhatsApp BaDekor"
            >
              <FaWhatsapp className="size-4" />
            </a>
            <a
              href="https://instagram.com"
              className="grid size-9 place-items-center rounded-full border border-paper/20 text-paper transition hover:border-paper/50"
              aria-label="Instagram BaDekor"
            >
              <FaInstagram className="size-4" />
            </a>
          </div>
        </div>

        {columns.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h2 className="mb-4 font-display text-sm font-medium text-paper">{column.title}</h2>
            <ul className="space-y-2.5">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    className="text-sm transition hover:text-paper hover:underline underline-offset-4"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-paper/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-5 text-spec sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>© 2026 BaDekor. Dibuat di Banjarmasin.</p>
          <p>Transfer bank · QRIS · Bayar di tempat</p>
        </div>
      </div>
    </footer>
  );
}

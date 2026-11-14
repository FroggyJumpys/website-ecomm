import { ButtonLink } from '../components/ui/Button.jsx';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl px-5 py-24 text-center sm:px-8">
      <p className="text-spec text-ink-soft">Halaman tidak ditemukan</p>
      <h1 className="mt-2 text-title text-ink">Alamat ini tidak ada di katalog kami</h1>
      <p className="mt-4 text-ink-soft">
        Mungkin tautannya salah ketik, atau produknya sudah tidak dijual lagi.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <ButtonLink to="/">Kembali ke beranda</ButtonLink>
        <ButtonLink to="/toko" variant="outline">
          Lihat koleksi
        </ButtonLink>
      </div>
    </div>
  );
}

/**
 * Shared frame for /masuk and /daftar. On desktop the photograph and the
 * workshop promise are the one expressive moment; the form column stays plain
 * paper so the fields keep the attention. On small screens the photograph is
 * dropped and the form carries the page on its own.
 */
export function AuthShell({ title, description, children }) {
  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14 lg:py-16">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_25rem] lg:gap-16 xl:grid-cols-[minmax(0,1fr)_27rem]">
        <aside className="hidden lg:block">
          <figure className="relative overflow-hidden rounded-card bg-ulin shadow-card">
            <img
              src="/images/category/category-6.jpg"
              alt="Ruang makan dengan meja kayu dan kursi putih, salah satu ruang yang ditata dengan perabot BaDekor."
              className="aspect-square w-full object-cover"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-linear-to-t from-ulin/95 via-ulin/25 to-transparent"
            />
            <figcaption className="absolute inset-x-0 bottom-0 p-8">
              <p className="font-display text-[1.375rem] font-medium leading-snug text-paper">
                Kami mengukur ruangmu dulu, baru memotong kayunya.
              </p>
              <p className="mt-3 text-spec text-paper/70">
                Tim BaDekor, bengkel Jl. Pierre Tendean
              </p>
            </figcaption>
          </figure>
        </aside>

        <div className="mx-auto w-full max-w-md lg:mx-0 lg:max-w-none">
          <h1 className="text-title text-ink">{title}</h1>
          {description && (
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{description}</p>
          )}

          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}

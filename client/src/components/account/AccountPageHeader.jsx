/**
 * Page heading used by every account screen. `action` holds the one control a
 * page can add (for example "Tambah alamat") so the heading row stays aligned
 * across pages.
 */
export function AccountPageHeader({ title, description, action }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-sand pb-6">
      <div className="max-w-xl">
        <h1 className="text-title text-ink">{title}</h1>
        {description && <p className="mt-2 text-sm leading-relaxed text-ink-soft">{description}</p>}
      </div>
      {action}
    </header>
  );
}

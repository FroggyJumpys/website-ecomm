/**
 * Temporary body for routes that are implemented in Phase 3. Each placeholder
 * names the review step that will replace it, so nothing ships half-built by
 * accident.
 */
export function PagePlaceholder({ eyebrow, title, description, step }) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-20 sm:px-8">
      <p className="text-spec text-ink-soft">{eyebrow}</p>
      <h1 className="mt-2 text-title text-ink">{title}</h1>
      <p className="mt-4 max-w-prose text-ink-soft">{description}</p>
      <p className="mt-8 inline-flex items-center gap-2 rounded-full bg-sand/70 px-3 py-1.5 text-spec text-ink-soft">
        Dikerjakan pada langkah {step}
      </p>
    </div>
  );
}

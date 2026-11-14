import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiX, FiZoomIn } from 'react-icons/fi';
import { cn } from '../../lib/cn.js';

function ImageLightbox({ src, alt, onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = originalOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pratinjau foto produk"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/85 p-4"
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Tutup pratinjau"
        className="absolute right-4 top-4 grid size-11 place-items-center rounded-full bg-paper text-ink transition hover:bg-surface"
      >
        <FiX className="size-5" aria-hidden="true" />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-h-[88vh] w-auto max-w-full rounded-card bg-paper object-contain"
      />
    </div>,
    document.body
  );
}

/**
 * Product photography frame. Renders one main image with an optional thumbnail
 * strip for products that ship more than one photo, plus a focus-managed
 * lightbox for closer inspection. The mock catalogue currently has one image
 * per product; the component is ready for the multi-image arrays the API will
 * return in step 04c.
 */
export function ProductGallery({ images = [], alt, className }) {
  const gallery = images.filter(Boolean);
  const [active, setActive] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const closePreview = useCallback(() => setPreviewOpen(false), []);
  const current = gallery[active] ?? null;
  const hasMultiple = gallery.length > 1;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="group relative overflow-hidden rounded-card bg-sand/40">
        {current ? (
          <img
            src={current}
            alt={alt}
            className="aspect-7/5 w-full object-cover transition duration-500 ease-out group-hover:scale-[1.02]"
          />
        ) : (
          <div className="grid aspect-7/5 w-full place-items-center text-spec text-ink-soft">
            Foto belum tersedia
          </div>
        )}

        {current && (
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            aria-label="Perbesar foto produk"
            className="absolute bottom-3 right-3 inline-flex h-9 items-center gap-2 rounded-full bg-paper/95 px-3.5 text-[0.8125rem] font-medium text-ink shadow-card backdrop-blur transition hover:bg-surface"
          >
            <FiZoomIn className="size-4" aria-hidden="true" />
            Perbesar
          </button>
        )}
      </div>

      {hasMultiple && (
        <ul className="grid grid-cols-5 gap-3" aria-label="Foto produk">
          {gallery.map((src, index) => {
            const selected = index === active;

            return (
              <li key={`${src}-${index}`}>
                <button
                  type="button"
                  onClick={() => setActive(index)}
                  aria-label={`Foto ${index + 1}`}
                  aria-current={selected ? 'true' : undefined}
                  className={cn(
                    'block w-full overflow-hidden rounded-field border bg-sand/40 transition',
                    selected ? 'border-ink' : 'border-transparent hover:border-ink/30'
                  )}
                >
                  <img
                    src={src}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="aspect-square w-full object-contain"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {previewOpen && current && <ImageLightbox src={current} alt={alt} onClose={closePreview} />}
    </div>
  );
}

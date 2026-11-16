import { cn } from '../../lib/cn.js';

/**
 * Selectable card backed by a real radio input. The input stays in the tab
 * order so keyboard users can move between options with the arrow keys; the
 * label is styled instead of the input.
 */
export function RadioCard({
  name,
  value,
  checked,
  onChange,
  title,
  description,
  meta,
  children,
  className,
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-field border px-4 py-3.5 transition',
        'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40',
        checked ? 'border-ink bg-ink/[0.03]' : 'border-ink/15 hover:border-ink/35',
        className
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 size-4 shrink-0 accent-primary"
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-sm font-medium text-ink">{title}</span>
          {meta}
        </span>
        {description && <span className="mt-1 block text-spec text-ink-soft">{description}</span>}
        {children}
      </span>
    </label>
  );
}

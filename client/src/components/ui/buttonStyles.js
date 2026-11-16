import { cn } from '../../lib/cn.js';

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-medium transition ' +
  'duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2';

const variants = {
  primary: 'bg-primary text-white hover:bg-primary-deep',
  dark: 'bg-ink text-paper hover:bg-ulin',
  danger: 'bg-danger text-white hover:bg-danger/90',
  outline: 'border border-ink/20 text-ink hover:border-ink hover:bg-ink/5',
  ghost: 'text-ink hover:bg-ink/5',
  link: 'rounded-none text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink',
};

const sizes = {
  sm: 'h-9 px-4 text-[0.8125rem]',
  md: 'h-11 px-6 text-sm',
  lg: 'h-12 px-7 text-sm',
};

/** Shared button classes, so <Button> and <ButtonLink> cannot drift apart. */
export function buttonStyles({ variant = 'primary', size = 'md', fullWidth = false, className } = {}) {
  return cn(
    base,
    variants[variant] ?? variants.primary,
    sizes[size] ?? sizes.md,
    fullWidth && 'w-full',
    className
  );
}

/** Icon-only control in the site header: cart, wishlist, account, menu. */
export const headerIconButton =
  'relative grid size-10 place-items-center rounded-full text-ink transition hover:bg-ink/5 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2';

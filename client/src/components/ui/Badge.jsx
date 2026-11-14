import { cn } from '../../lib/cn.js';

const tones = {
  neutral: 'bg-sand text-ink',
  accent: 'bg-primary/10 text-primary-deep',
  dark: 'bg-ink text-paper',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
};

export function Badge({ tone = 'neutral', className, children, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[0.6875rem] font-medium leading-none',
        tones[tone] ?? tones.neutral,
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

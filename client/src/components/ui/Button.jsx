import { Link } from 'react-router-dom';
import { buttonStyles } from './buttonStyles.js';

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={buttonStyles({ variant, size, fullWidth, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}

export function ButtonLink({ to, variant = 'primary', size = 'md', className, children, ...props }) {
  return (
    <Link to={to} className={buttonStyles({ variant, size, className })} {...props}>
      {children}
    </Link>
  );
}

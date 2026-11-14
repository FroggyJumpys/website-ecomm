import { useId, useState } from 'react';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import { cn } from '../../lib/cn.js';

const control =
  'w-full rounded-field border border-ink/15 bg-surface px-3 text-sm text-ink ' +
  'placeholder:text-ink-soft/70 focus:border-primary focus:ring-2 focus:ring-primary/25 ' +
  'focus:outline-hidden disabled:cursor-not-allowed disabled:bg-sand/40';

/**
 * Label + control + hint/error wrapper. Every input in the app goes through
 * this so labelling and error wiring stay consistent.
 */
export function Field({ label, hint, error, required, htmlFor, children, className }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-spec text-ink-soft">
          {label}
          {required && (
            <span className="text-primary" aria-hidden="true">
              {' '}
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-spec text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-spec text-ink-soft/80">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ id, label, hint, error, required, className, ...props }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={inputId}>
      <input
        id={inputId}
        required={required}
        aria-invalid={error ? 'true' : undefined}
        className={cn(control, 'h-11', error && 'border-danger focus:border-danger', className)}
        {...props}
      />
    </Field>
  );
}

export function Textarea({ id, label, hint, error, required, rows = 4, className, ...props }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={inputId}>
      <textarea
        id={inputId}
        rows={rows}
        required={required}
        aria-invalid={error ? 'true' : undefined}
        className={cn(control, 'py-2.5', error && 'border-danger', className)}
        {...props}
      />
    </Field>
  );
}

export function PasswordInput({ id, label, hint, error, required, className, ...props }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={inputId}>
      <div className="relative">
        <input
          id={inputId}
          type={visible ? 'text' : 'password'}
          required={required}
          aria-invalid={error ? 'true' : undefined}
          className={cn(
            control,
            'h-11 pr-12',
            error && 'border-danger focus:border-danger',
            className
          )}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
          aria-pressed={visible}
          className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-ink-soft transition hover:bg-ink/5 hover:text-ink"
        >
          {visible ? (
            <FiEyeOff className="size-4" aria-hidden="true" />
          ) : (
            <FiEye className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </Field>
  );
}

export function Select({ id, label, hint, error, required, className, children, ...props }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={inputId}>
      <select
        id={inputId}
        required={required}
        aria-invalid={error ? 'true' : undefined}
        className={cn(control, 'h-11 pr-8', error && 'border-danger', className)}
        {...props}
      >
        {children}
      </select>
    </Field>
  );
}

export function Checkbox({ id, label, error, className, ...props }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-start gap-2.5">
        <input
          id={inputId}
          type="checkbox"
          aria-invalid={error ? 'true' : undefined}
          className="mt-[0.3125rem] size-4 shrink-0 rounded-xs border-ink/25 text-primary focus:ring-primary/30"
          {...props}
        />
        {label && (
          <label htmlFor={inputId} className="text-sm leading-snug text-ink">
            {label}
          </label>
        )}
      </div>
      {error && (
        <p className="text-spec text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

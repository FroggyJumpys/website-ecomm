import { FiAlertCircle } from 'react-icons/fi';

/**
 * Form-level failure (wrong credentials, duplicate email, network). Field-level
 * messages live next to their input; this block is only for what a single field
 * cannot explain.
 */
export function FormAlert({ message }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-field border border-danger/30 bg-danger/5 px-3.5 py-3 text-sm text-danger"
    >
      <FiAlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}

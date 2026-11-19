/**
 * The numbered written instructions for a payment method.
 *
 * Used by the QRIS block and by the no-credentials fallback in `PaymentPanel`,
 * so both render the same steps in the same order. The steps come from
 * `lib/shipping.js`, which is the only place that holds payment copy.
 */
export function PaymentInstructions({ steps, className }) {
  return (
    <ol className={`space-y-2 ${className ?? ''}`}>
      {steps.map((step, index) => (
        <li key={step} className="flex gap-3 text-sm text-ink-soft">
          <span
            aria-hidden="true"
            className="tabular grid size-5 shrink-0 place-items-center rounded-full bg-sand text-[0.6875rem] font-medium text-ink"
          >
            {index + 1}
          </span>
          <span className="leading-relaxed">{step}</span>
        </li>
      ))}
    </ol>
  );
}

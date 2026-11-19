import { Badge } from '../ui/Badge.jsx';
import { paymentStatusMeta } from '../../lib/paymentStatus.js';

/** One rendering of a payment status, used by the confirmation and detail pages. */
export function PaymentStatusBadge({ status, className }) {
  const meta = paymentStatusMeta(status);

  return (
    <Badge tone={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}

import { Badge } from '../ui/Badge.jsx';
import { statusMeta } from '../../lib/orderStatus.js';

export function OrderStatusBadge({ status, className }) {
  const meta = statusMeta(status);

  return (
    <Badge tone={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}

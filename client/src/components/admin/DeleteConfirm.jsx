import { Button } from '../ui/Button.jsx';
import { FormAlert } from '../ui/FormAlert.jsx';
import { Modal } from '../ui/Modal.jsx';

/**
 * Confirmation for deleting a product, category or brand. The dialog names the
 * record, so a mis-click on the row above cannot look like the same action, and
 * server-side refusals (a category still in use) are shown here rather than in
 * a toast that has already gone.
 */
export function DeleteConfirm({
  open,
  title,
  description,
  confirmLabel = 'Hapus',
  busy = false,
  error = '',
  onConfirm,
  onCancel,
}) {
  return (
    <Modal open={open} onClose={busy ? () => {} : onCancel} title={title}>
      <p className="text-sm leading-relaxed text-ink-soft">{description}</p>

      {error && (
        <div className="mt-4">
          <FormAlert message={error} />
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Batal
        </Button>
        <Button variant="danger" onClick={onConfirm} loading={busy}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

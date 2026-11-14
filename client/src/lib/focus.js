/**
 * Move focus to the first field the form marked invalid. Runs after the
 * validation state has been committed, so the `aria-invalid` attribute already
 * exists when it looks for it.
 */
export function focusFirstInvalid(container) {
  window.requestAnimationFrame(() => {
    const target = container?.querySelector('[aria-invalid="true"]');

    if (target instanceof HTMLElement) target.focus();
  });
}

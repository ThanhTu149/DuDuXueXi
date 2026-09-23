import useDialogA11y from '../lib/useDialogA11y.js';

export default function ConfirmDialog({ title, message, confirmLabel = 'Xác nhận', onConfirm, onCancel, danger = false }) {
  const dialogRef = useDialogA11y(true, onCancel);

  return <div className="modal-backdrop fixed inset-0 z-[140] flex items-center justify-center bg-black/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section ref={dialogRef} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message" className="animate-modal-in w-full max-w-md rounded-lg border border-border bg-bg-secondary p-5 shadow-lg">
      <h2 id="confirm-title" className="font-serif text-lg font-semibold">{title}</h2>
      <p id="confirm-message" className="mt-2 text-sm leading-6 text-text-secondary">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" autoFocus onClick={onCancel} className="btn-secondary">Hủy</button>
        <button type="button" onClick={onConfirm} className={danger ? 'rounded-md border border-error bg-error px-4 py-2 font-semibold text-white transition hover:-translate-y-px hover:brightness-95 active:scale-[0.98]' : 'btn-primary'}>{confirmLabel}</button>
      </div>
    </section>
  </div>;
}

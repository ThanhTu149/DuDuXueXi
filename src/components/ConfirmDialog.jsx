import { useEffect } from 'react';

export default function ConfirmDialog({ title, message, confirmLabel = 'Xác nhận', onConfirm, onCancel, danger = false }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onCancel]);

  return <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message" className="w-full max-w-md rounded-lg border border-border bg-bg-secondary p-5 shadow-lg">
      <h2 id="confirm-title" className="font-serif text-lg font-semibold">{title}</h2>
      <p id="confirm-message" className="mt-2 text-sm leading-6 text-text-secondary">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" autoFocus onClick={onCancel} className="btn-secondary">Hủy</button>
        <button type="button" onClick={onConfirm} className={danger ? 'rounded-lg bg-error px-4 py-2 font-semibold text-white' : 'btn-primary'}>{confirmLabel}</button>
      </div>
    </section>
  </div>;
}

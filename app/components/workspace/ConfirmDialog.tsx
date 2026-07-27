"use client";

import { useEffect, useRef } from 'react';

/**
 * Confirmation for actions that materially change what recognition happens, or
 * that remove configuration (EX-H7, EX-H8).
 *
 * Both buttons name their action. "Cancel / Confirm" makes the operator
 * reconstruct the consequence from memory; "Keep group active / Deactivate
 * group" states it. Deliberately not used for routine reversible actions —
 * confirmation everywhere is confirmation nowhere.
 *
 * Also closes the EX-L2 gap: focus is trapped, Escape dismisses, and focus
 * returns to wherever it came from.
 */
export default function ConfirmDialog({
  title,
  body,
  impact,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  /** Concrete consequences — counts, current effect. Omit when there are none. */
  impact?: string[];
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Focus lands on the non-destructive choice, so a stray Enter is harmless.
    cancelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>('button');
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-ink/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div
        ref={panelRef}
        className="bg-white rounded-2xl border border-stone/20 p-5 sm:p-6 max-w-md w-full shadow-lg space-y-3 max-h-[85vh] overflow-y-auto"
      >
        <p id="confirm-dialog-title" className="font-display font-semibold text-lg text-ink">
          {title}
        </p>
        <p className="font-body text-sm text-stone leading-relaxed">{body}</p>

        {impact && impact.length > 0 && (
          <ul className="bg-cream rounded-xl px-4 py-3 space-y-1.5">
            {impact.map((line, i) => (
              <li key={i} className="font-body text-xs text-ink flex items-start gap-2">
                <span aria-hidden className="text-stone/40">&bull;</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 sm:gap-3 pt-1">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-full bg-gold text-ink font-semibold text-sm px-5 py-2.5 hover:brightness-105 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="font-body text-sm text-stone hover:text-ink transition-colors py-2.5 px-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-stone focus-visible:ring-offset-2"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

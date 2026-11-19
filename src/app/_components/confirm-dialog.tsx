'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useFormStatus } from 'react-dom';
import { closeDialogTopLayer, isOutsideDialogRect, supportsClosedBy, supportsTopLayerExit } from '@/lib/ui/dialog';

export type ConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  busy?: boolean;
};

/**
 * Native modal <dialog> for destructive or irreversible confirmations.
 * Uses showModal() for top-layer promotion, inert page, focus containment, Esc dismissal, and
 * automatic focus return to the invoker; never duplicates role="dialog" or aria-modal.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'default',
  busy = false,
}: ConfirmDialogProps) {
  const uid = useId();
  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const onConfirmRef = useRef(onConfirm);
  onCloseRef.current = onClose;
  onConfirmRef.current = onConfirm;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      const choice = dialog.returnValue;
      // Reset returnValue so Esc or backdrop dismissals cannot inherit a prior button value.
      dialog.returnValue = '';
      onCloseRef.current();
      if (choice === 'confirm') {
        onConfirmRef.current();
      }
    };

    const handleCancel = (event: Event) => {
      if (dialog.hasAttribute('data-closing') || !supportsTopLayerExit()) {
        event.preventDefault();
        void closeDialogTopLayer(dialog, '');
      }
    };

    dialog.addEventListener('close', handleClose);
    dialog.addEventListener('cancel', handleCancel);

    if (supportsClosedBy()) {
      return () => {
        dialog.removeEventListener('close', handleClose);
        dialog.removeEventListener('cancel', handleCancel);
      };
    }

    // Fallback for browsers without <dialog closedby="any"> (e.g. Safari): require both press and
    // release outside the dialog's border box so text-selection drags onto the backdrop do not dismiss.
    let pressedOutside = false;
    const handlePointerDown = (event: PointerEvent) => {
      if (!dialog.open) return;
      pressedOutside = isOutsideDialogRect(dialog.getBoundingClientRect(), event.clientX, event.clientY);
    };
    const handlePointerUp = (event: PointerEvent) => {
      const shouldDismiss =
        pressedOutside &&
        dialog.open &&
        isOutsideDialogRect(dialog.getBoundingClientRect(), event.clientX, event.clientY);
      pressedOutside = false;
      if (shouldDismiss) void closeDialogTopLayer(dialog, '');
    };

    dialog.addEventListener('pointerdown', handlePointerDown);
    dialog.addEventListener('pointerup', handlePointerUp);
    return () => {
      dialog.removeEventListener('close', handleClose);
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('pointerdown', handlePointerDown);
      dialog.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.removeAttribute('data-closing');
      dialog.returnValue = '';
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!open && dialog.open) {
      void closeDialogTopLayer(dialog, '');
    }
  }, [open]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const dialog = dialogRef.current;
    if (!dialog || supportsTopLayerExit()) return;
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const value = submitter instanceof HTMLButtonElement ? submitter.value : 'cancel';
    void closeDialogTopLayer(dialog, value);
  }

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      aria-labelledby={titleId}
      aria-describedby={descId}
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      <form method="dialog" className="confirm-dialog-form" onSubmit={handleSubmit}>
        <h2 id={titleId} className="confirm-dialog-title">{title}</h2>
        <p id={descId} className="confirm-dialog-body">{description}</p>
        <div className="confirm-dialog-actions">
          <button ref={cancelRef} type="submit" value="cancel" className="btn secondary" autoFocus>
            {cancelLabel}
          </button>
          <button
            type="submit"
            value="confirm"
            className={tone === 'danger' ? 'btn danger' : 'btn'}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function ActionTrigger({ label, className, onClick }: { label: string; className?: string; onClick: () => void }) {
  const { pending } = useFormStatus();
  return (
    <button type="button" className={className} onClick={onClick} disabled={pending} aria-busy={pending || undefined}>
      {pending ? 'Procesando…' : label}
    </button>
  );
}

export type ConfirmActionButtonProps = {
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  triggerLabel: string;
  triggerClassName?: string;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
};

/**
 * Renders a Server Action form triggered only after the user confirms in a native <ConfirmDialog>.
 * The dialog lives as a sibling so <form method="dialog"> is never nested inside the action <form>.
 */
export function ConfirmActionButton({
  action,
  fields,
  triggerLabel,
  triggerClassName,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'default',
}: ConfirmActionButtonProps) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <form ref={formRef} action={action} className="admin-inline">
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <ActionTrigger label={triggerLabel} className={triggerClassName} onClick={() => setOpen(true)} />
      </form>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => formRef.current?.requestSubmit()}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        tone={tone}
      />
    </>
  );
}

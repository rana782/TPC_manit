import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import Input from './Input';

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
  inputLabel?: string;
  inputPlaceholder?: string;
  onConfirm: (inputValue?: string) => void;
  onCancel: () => void;
}

const ConfirmModal = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  inputLabel,
  inputPlaceholder,
  onConfirm,
  onCancel,
}: ConfirmModalProps) => {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (open) {
      setInputValue('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
  }, [open]);

  const confirmClassName = clsx(
    'inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2',
    variant === 'danger' &&
      'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    variant === 'warning' &&
      'bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-400',
    variant === 'default' &&
      'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500'
  );

  const handleConfirm = () => {
    if (inputLabel !== undefined && inputLabel !== '') {
      onConfirm(inputValue);
    } else {
      onConfirm();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="confirm-modal"
          role="presentation"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[1px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onCancel}
        >
          <div className="flex min-h-full items-start justify-center px-4 py-8">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-modal-title"
              aria-describedby="confirm-modal-description"
              className="max-w-md w-full mx-auto mt-[20vh] rounded-2xl bg-white shadow-2xl p-6"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2
                id="confirm-modal-title"
                className="text-lg font-semibold text-slate-900"
              >
                {title}
              </h2>
              <p
                id="confirm-modal-description"
                className="mt-2 text-sm text-slate-600"
              >
                {description}
              </p>

              {inputLabel != null && inputLabel !== '' && (
                <div className="mt-4">
                  <Input
                    label={inputLabel}
                    placeholder={inputPlaceholder}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onCancel}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
                >
                  {cancelLabel}
                </button>
                <button
                  ref={confirmRef}
                  type="button"
                  onClick={handleConfirm}
                  className={confirmClassName}
                >
                  {confirmLabel}
                </button>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ConfirmModal;

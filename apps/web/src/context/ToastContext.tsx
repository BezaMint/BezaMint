'use client';

import React, { createContext, useContext, useCallback } from 'react';
import toast from 'react-hot-toast';

// ─────────────────────── Types ───────────────────────

type ToastType = 'success' | 'error' | 'loading' | 'info';

interface ToastAction {
  /** Short button label, e.g. "Open explorer" */
  label: string;
  /** Called when the action button is clicked (and the toast is dismissed) */
  onAction: () => void;
}

interface ToastOptions {
  /** Optional action button rendered on the toast (e.g. tx success deep-links) */
  action?: ToastAction;
}

interface ToastContextValue {
  showSuccess: (message: string, options?: ToastOptions) => void;
  showError: (message: string) => void;
  showLoading: (message: string) => string;
  dismissToast: (id: string) => void;
}

// ─────────────────────── Context ───────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

const BASE_STYLE: React.CSSProperties = {
  background: '#111827',
  color: '#f3f4f6',
  border: '1px solid #1f2937',
};

// ─────────────────────── Provider ───────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const showSuccess = useCallback((message: string, options?: ToastOptions) => {
    const action = options?.action;
    if (!action) {
      toast.success(message, {
        style: BASE_STYLE,
        iconTheme: { primary: '#24a563', secondary: '#fff' },
      });
      return;
    }

    toast.custom(
      (t) => (
        <div
          className={`flex items-center gap-3 rounded-2xl px-4 py-3 shadow-lg ${
            t.visible ? 'animate-fade-in' : ''
          }`}
          style={{ ...BASE_STYLE, borderColor: '#24a56340' }}
        >
          <span className="text-sm">{message}</span>
          <button
            onClick={() => {
              toast.dismiss(t.id);
              action.onAction();
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-bezamint-primary/20 text-bezamint-secondary hover:bg-bezamint-primary/30 transition-colors flex-shrink-0"
          >
            {action.label}
          </button>
        </div>
      ),
      { duration: 8000 },
    );
  }, []);

  const showError = useCallback((message: string) => {
    toast.error(message, {
      style: BASE_STYLE,
      iconTheme: { primary: '#ef4444', secondary: '#fff' },
      duration: 6000,
    });
  }, []);

  const showLoading = useCallback((message: string): string => {
    return toast.loading(message, { style: BASE_STYLE });
  }, []);

  const dismissToast = useCallback((id: string) => {
    toast.dismiss(id);
  }, []);

  return (
    <ToastContext.Provider value={{ showSuccess, showError, showLoading, dismissToast }}>
      {children}
    </ToastContext.Provider>
  );
}

// ─────────────────────── Hook ───────────────────────

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}

'use client';

import React, { createContext, useContext, useCallback } from 'react';
import toast from 'react-hot-toast';

// ─────────────────────── Types ───────────────────────

type ToastType = 'success' | 'error' | 'loading' | 'info';

interface ToastContextValue {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showLoading: (message: string) => string;
  dismissToast: (id: string) => void;
}

// ─────────────────────── Context ───────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

// ─────────────────────── Provider ───────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const showSuccess = useCallback((message: string) => {
    toast.success(message, {
      style: {
        background: '#111827',
        color: '#f3f4f6',
        border: '1px solid #1f2937',
      },
      iconTheme: { primary: '#24a563', secondary: '#fff' },
    });
  }, []);

  const showError = useCallback((message: string) => {
    toast.error(message, {
      style: {
        background: '#111827',
        color: '#f3f4f6',
        border: '1px solid #1f2937',
      },
      iconTheme: { primary: '#ef4444', secondary: '#fff' },
      duration: 6000,
    });
  }, []);

  const showLoading = useCallback((message: string): string => {
    return toast.loading(message, {
      style: {
        background: '#111827',
        color: '#f3f4f6',
        border: '1px solid #1f2937',
      },
    });
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

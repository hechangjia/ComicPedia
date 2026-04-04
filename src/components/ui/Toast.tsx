"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { CheckCircle, AlertTriangle, XCircle, Info, X } from "lucide-react";

export type ToastType = "success" | "warning" | "error" | "info";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  toast: (type: ToastType, message: string, duration?: number) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const ICONS = {
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
};

const STYLES = {
  success: "bg-[#f0fdf4] dark:bg-[#5a9e6f]/10 text-[#5a9e6f] border-[#5a9e6f]/20",
  warning: "bg-[#faf6ea] dark:bg-[#c49a3d]/10 text-[#c49a3d] border-[#c49a3d]/20",
  error: "bg-[#fef2f2] dark:bg-[#c05a4a]/10 text-[#c05a4a] border-[#c05a4a]/20",
  info: "bg-[#edf4f8] dark:bg-[#5b8fb8]/10 text-[#5b8fb8] border-[#5b8fb8]/20",
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const Icon = ICONS[toast.type];

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration || 4000);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-[10px] border shadow-md text-sm font-medium animate-in slide-in-from-top-2 fade-in duration-200 ${STYLES[toast.type]}`}
      role="alert"
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((type: ToastType, message: string, duration?: number) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-4), { id, type, message, duration }]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast, dismiss }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed top-16 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
          {toasts.map((t) => (
            <div key={t.id} className="pointer-events-auto">
              <ToastItem toast={t} onDismiss={dismiss} />
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

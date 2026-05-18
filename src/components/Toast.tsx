import { useEffect, useState } from 'react'
import type { Toast as ToastItem, ToastType } from '../types'

interface ToastProps {
  toasts: ToastItem[]
  onRemove: (id: string) => void
}

const toastStyles: Record<ToastType, string> = {
  success: 'bg-green-500 text-white',
  error: 'bg-red-500 text-white',
  warning: 'bg-yellow-500 text-white',
  info: 'bg-blue-500 text-white',
}

const toastIcons: Record<ToastType, string> = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
}

function ToastItem({ toast, onRemove }: { toast: ToastItem; onRemove: (id: string) => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const showTimer = setTimeout(() => setVisible(true), 10)
    const hideTimer = setTimeout(() => {
      setVisible(false)
      setTimeout(() => onRemove(toast.id), 300)
    }, 3500)

    return () => {
      clearTimeout(showTimer)
      clearTimeout(hideTimer)
    }
  }, [toast.id, onRemove])

  return (
    <div
      className={`flex items-start gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium max-w-sm w-full
        transition-all duration-300
        ${toastStyles[toast.type]}
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
      `}
    >
      <span className="shrink-0 text-base leading-5">{toastIcons[toast.type]}</span>
      <span className="flex-1 leading-5">{toast.message}</span>
      <button
        onClick={() => onRemove(toast.id)}
        className="shrink-0 opacity-70 hover:opacity-100 leading-5"
        aria-label="ปิด"
      >
        ✕
      </button>
    </div>
  )
}

export function ToastContainer({ toasts, onRemove }: ToastProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onRemove={onRemove} />
        </div>
      ))}
    </div>
  )
}

let toastCallback: ((message: string, type: ToastType) => void) | null = null

export function registerToast(cb: (message: string, type: ToastType) => void) {
  toastCallback = cb
}

export function showToast(message: string, type: ToastType = 'info') {
  toastCallback?.(message, type)
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = (message: string, type: ToastType = 'info') => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((prev) => [...prev, { id, message, type }])
  }

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  useEffect(() => {
    registerToast(addToast)
    return () => { toastCallback = null }
  }, [])

  return { toasts, addToast, removeToast }
}

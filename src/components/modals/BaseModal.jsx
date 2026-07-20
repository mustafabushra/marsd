import React from 'react'
import { X } from 'lucide-react'

/**
 * BaseModal — Reusable modal wrapper for all dialog types
 * Handles: backdrop, close button, animations, RTL, accessibility
 */
export function BaseModal({
  isOpen,
  onClose,
  title,
  children,
  actions,
  size = 'md',
  type = 'default',
  closeButton = true,
}) {
  if (!isOpen) return null

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  }

  const typeClasses = {
    default: 'border-slate-200',
    warning: 'border-amber-200 bg-amber-50',
    danger: 'border-red-200 bg-red-50',
    success: 'border-green-200 bg-green-50',
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className={`
            bg-white rounded-lg shadow-xl border ${sizeClasses[size]} ${typeClasses[type]}
            w-full max-h-[90vh] overflow-y-auto
            transform transition-all duration-200
            animate-in fade-in zoom-in-95
          `}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          {/* Header */}
          {(title || closeButton) && (
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              {title && (
                <h2 id="modal-title" className="text-lg font-semibold text-slate-900">
                  {title}
                </h2>
              )}
              {closeButton && (
                <button
                  onClick={onClose}
                  className="p-1 hover:bg-slate-100 rounded-md transition-colors"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              )}
            </div>
          )}

          {/* Content */}
          <div className="p-6">{children}</div>

          {/* Footer with Actions */}
          {actions && actions.length > 0 && (
            <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200 bg-slate-50">
              {actions.map((action, idx) => (
                <button
                  key={idx}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  className={`
                    px-4 py-2 rounded-md font-medium transition-colors
                    ${
                      action.variant === 'primary'
                        ? 'bg-green-600 text-white hover:bg-green-700 disabled:bg-slate-300'
                        : action.variant === 'danger'
                          ? 'bg-red-600 text-white hover:bg-red-700 disabled:bg-slate-300'
                          : action.variant === 'success'
                            ? 'bg-green-600 text-white hover:bg-green-700 disabled:bg-slate-300'
                            : 'bg-slate-200 text-slate-900 hover:bg-slate-300 disabled:bg-slate-100'
                    }
                  `}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default BaseModal

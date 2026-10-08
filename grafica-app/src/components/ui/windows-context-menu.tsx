"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

export interface WindowsContextMenuItem {
  label: string
  icon?: React.ReactNode
  onClick?: () => void
  variant?: "default" | "destructive" | "primary"
  disabled?: boolean
  shortcut?: string
  badge?: string | number
  separatorBelow?: boolean
}

export interface WindowsContextMenuProps {
  x: number
  y: number
  title?: string
  subtitle?: string
  items: WindowsContextMenuItem[]
  onClose: () => void
}

export function WindowsContextMenu({
  x,
  y,
  title,
  subtitle,
  items,
  onClose,
}: WindowsContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  const [coords, setCoords] = useState({ left: x, top: y })

  useEffect(() => {
    setMounted(true)
  }, [])

  // Ajusta a posição para não vazar da janela (Windows Collision Clamping)
  useEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const padding = 12
    const winWidth = window.innerWidth
    const winHeight = window.innerHeight

    let nextLeft = x
    let nextTop = y

    if (x + rect.width > winWidth - padding) {
      nextLeft = Math.max(padding, x - rect.width)
    }
    if (y + rect.height > winHeight - padding) {
      nextTop = Math.max(padding, y - rect.height)
    }

    setCoords({ left: nextLeft, top: nextTop })
  }, [x, y])

  // Fecha ao clicar fora ou pressionar ESC
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose()
      }
    }

    window.addEventListener("pointerdown", handlePointerDown)
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [onClose])

  if (!mounted) return null

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={title || "Menu de Contexto"}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: `${coords.left}px`, top: `${coords.top}px` }}
      className={cn(
        "fixed z-50 min-w-[230px] max-w-[340px] select-none rounded-xl p-1.5",
        "bg-white/95 dark:bg-neutral-900/95 backdrop-blur-xl",
        "border border-neutral-200/80 dark:border-neutral-800",
        "shadow-2xl shadow-black/20 ring-1 ring-black/5 dark:ring-white/10",
        "animate-in fade-in-0 zoom-in-95 duration-100 ease-out"
      )}
    >
      {(title || subtitle) && (
        <div className="px-2.5 py-1.5 border-b border-neutral-200/60 dark:border-neutral-800/80 mb-1">
          {title && (
            <div className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-200 truncate flex items-center justify-between">
              <span className="truncate">{title}</span>
            </div>
          )}
          {subtitle && (
            <div className="text-[10px] text-muted-foreground truncate font-mono">
              {subtitle}
            </div>
          )}
        </div>
      )}

      <div className="space-y-0.5">
        {items.map((item, idx) => {
          const isDestructive = item.variant === "destructive"
          const isPrimary = item.variant === "primary"

          return (
            <div key={idx}>
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return
                  item.onClick?.()
                  onClose()
                }}
                className={cn(
                  "group flex items-center justify-between w-full px-2.5 py-2 text-xs rounded-lg transition-colors text-left",
                  item.disabled
                    ? "opacity-40 cursor-not-allowed"
                    : isDestructive
                    ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700"
                    : isPrimary
                    ? "text-primary font-medium hover:bg-primary/10"
                    : "text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {item.icon && (
                    <span
                      className={cn(
                        "size-4 shrink-0 transition-transform group-hover:scale-105",
                        isDestructive
                          ? "text-red-500 dark:text-red-400"
                          : isPrimary
                          ? "text-primary"
                          : "text-neutral-500 dark:text-neutral-400"
                      )}
                    >
                      {item.icon}
                    </span>
                  )}
                  <span className="truncate">{item.label}</span>
                </div>

                <div className="flex items-center gap-1.5 pl-2 shrink-0">
                  {item.badge !== undefined && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary">
                      {item.badge}
                    </span>
                  )}
                  {item.shortcut && (
                    <kbd className="text-[10px] text-muted-foreground font-mono bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded border border-neutral-200 dark:border-neutral-700">
                      {item.shortcut}
                    </kbd>
                  )}
                </div>
              </button>

              {item.separatorBelow && (
                <div className="h-px bg-neutral-200/60 dark:border-neutral-800 my-1 mx-1" />
              )}
            </div>
          )
        })}
      </div>
    </div>,
    document.body
  )
}

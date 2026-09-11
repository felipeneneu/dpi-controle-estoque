"use client"

import React, { useEffect, useRef } from 'react'

interface ScrollableContainerProps {
  children: React.ReactNode
  onReachTop?: () => void
  hasMore?: boolean
  isLoading?: boolean
}

export const ScrollableContainer: React.FC<ScrollableContainerProps> = ({
  children,
  onReachTop,
  hasMore = false,
  isLoading = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const previousScrollHeightRef = useRef<number>(0)

  // Efeito para manter a posição do scroll após carregar itens no topo
  useEffect(() => {
    if (containerRef.current && previousScrollHeightRef.current > 0 && !isLoading) {
      const container = containerRef.current
      const delta = container.scrollHeight - previousScrollHeightRef.current
      container.scrollTop += delta
      previousScrollHeightRef.current = 0
    }
  }, [children, isLoading])

  // Intersection Observer para detectar aproximação do topo (Infinite Scroll)
  useEffect(() => {
    if (!onReachTop || !hasMore || isLoading) return

    const observer = new IntersectionObserver(
      (entries) => {
        const firstEntry = entries[0]
        if (firstEntry.isIntersecting && containerRef.current) {
          // Salva a altura atual antes do novo conteúdo renderizar
          previousScrollHeightRef.current = containerRef.current.scrollHeight
          onReachTop()
        }
      },
      {
        root: containerRef.current,
        rootMargin: '100px 0px 0px 0px', // Dispara 100px antes de encostar no topo absoluto
      }
    )

    if (triggerRef.current) {
      observer.observe(triggerRef.current)
    }

    return () => observer.disconnect()
  }, [onReachTop, hasMore, isLoading])

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-y-auto overflow-x-hidden will-change-[scroll-position] select-none scrollbar-hidden-hover"
    >
      {/* Gatilho invisível para o Infinite Scroll */}
      {hasMore && <div ref={triggerRef} className="h-1 w-full" />}

      {isLoading && (
        <div className="w-full py-4 flex justify-center text-sm text-zinc-500">
          Carregando mensagens antigas...
        </div>
      )}

      {children}
    </div>
  )
}

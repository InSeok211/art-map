import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { sheetSnapOpen } from './useSheetDrag'

export const MOBILE_PANEL_PEEK = 92

export function mobilePanelOpenHeight(hostHeight: number) {
  return Math.max(MOBILE_PANEL_PEEK, Math.min(560, hostHeight - 150))
}

export function useMobilePanelDrag(card: RefObject<HTMLElement | null>, resetKey: string) {
  const [position, setPosition] = useState<'auto' | 'open' | 'peek'>('auto')
  const suppressClick = useRef(false)
  const drag = useRef<{ id: number; start: number; height: number; current: number; y: number; time: number; speed: number; moved: boolean } | null>(null)
  const restore = () => {
    card.current?.classList.remove('is-dragging')
    card.current?.style.removeProperty('--gm-drag-height')
    drag.current = null
  }
  useEffect(() => { restore(); setPosition('auto') }, [resetKey])
  const finish = (event: ReactPointerEvent<HTMLElement>, cancel = false) => {
    const current = drag.current
    const host = card.current?.closest<HTMLElement>('.gamcheon-map')
    if (!current || event.pointerId !== current.id || !host) return
    if (current.moved) {
      suppressClick.current = true
      if (!cancel) {
        // 멈춰 기다린 뒤 놓으면 오래된 속도 대신 현재 위치로 판단합니다.
        const speed = event.timeStamp - current.time > 120 ? 0 : current.speed
        setPosition(sheetSnapOpen(current.current, speed, mobilePanelOpenHeight(host.clientHeight), MOBILE_PANEL_PEEK) ? 'open' : 'peek')
      }
    }
    restore()
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  return {
    position,
    reveal: () => setPosition('auto'),
    handleProps: {
      onPointerDown(event: ReactPointerEvent<HTMLElement>) {
        if (event.button !== 0 || drag.current) return
        const element = card.current
        const host = element?.closest<HTMLElement>('.gamcheon-map')
        if (!element || !host || host.clientWidth > 720) return
        suppressClick.current = false
        event.currentTarget.setPointerCapture?.(event.pointerId)
        const height = element.getBoundingClientRect().height
        drag.current = { id: event.pointerId, start: event.clientY, height, current: height, y: event.clientY, time: event.timeStamp, speed: 0, moved: false }
      },
      onPointerMove(event: ReactPointerEvent<HTMLElement>) {
        const current = drag.current
        const element = card.current
        const host = element?.closest<HTMLElement>('.gamcheon-map')
        if (!current || current.id !== event.pointerId || !element || !host) return
        const dy = event.clientY - current.start
        if (!current.moved && Math.abs(dy) < 6) return
        current.moved = true
        const elapsed = event.timeStamp - current.time
        if (elapsed > 0) current.speed = (event.clientY - current.y) / elapsed
        current.y = event.clientY; current.time = event.timeStamp
        current.current = Math.max(MOBILE_PANEL_PEEK, Math.min(mobilePanelOpenHeight(host.clientHeight), current.height - dy))
        element.classList.add('is-dragging')
        element.style.setProperty('--gm-drag-height', `${current.current}px`)
      },
      onPointerUp: (event: ReactPointerEvent<HTMLElement>) => finish(event),
      onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => finish(event, true),
      onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => finish(event, true),
      onClick() {
        if (suppressClick.current) { suppressClick.current = false; return }
        setPosition(current => current === 'peek' ? 'open' : 'peek')
      },
    },
  }
}

import { useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'

// 휴대폰 아래 시트를 손가락으로 끌어 펼치고 접는 훅입니다. 끄는 동안은 높이를 손가락에 바로 맞추고
// (화면을 다시 그리지 않음), 놓으면 빠르기·위치에 따라 펼침/접힘 중 하나로 자리 잡습니다.

// 접힌 시트 높이(px). CSS의 접힌 시트(max-height: 176px)와 같습니다.
export const SHEET_PEEK = 176
// 이보다 적게 움직이면 끈 것이 아니라 누른 것(탭)으로 봅니다(px).
const DRAG_THRESHOLD = 6
// 이보다 빠르게 쓸어 넘기면 위치와 상관없이 그 방향으로 엽니다/닫습니다(px/ms).
const FLICK_SPEED = 0.35

// 펼친 시트 높이: CSS의 min(68%, 560px)와 같습니다.
export function sheetOpenHeight(containerHeight: number) {
  return Math.min(containerHeight * 0.68, 560)
}

// 손을 뗀 순간의 높이·속도(아래로 +)로 펼칠지 정합니다.
export function sheetSnapOpen(height: number, velocity: number, openHeight: number, peek = SHEET_PEEK) {
  if (velocity <= -FLICK_SPEED) return true
  if (velocity >= FLICK_SPEED) return false
  return height > (peek + openHeight) / 2
}

export function useSheetDrag(panelRef: RefObject<HTMLElement | null>, open: boolean, setOpen: (open: boolean) => void) {
  const dragRef = useRef<{ startY: number; startHeight: number; lastY: number; lastTime: number; velocity: number; moved: boolean; height: number } | null>(null)

  const finish = (panel: HTMLElement) => {
    panel.classList.remove('is-dragging')
    panel.style.maxHeight = ''
    dragRef.current = null
  }

  return {
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      const panel = panelRef.current
      // 넓은 화면(옆 패널)에서는 끌지 않습니다.
      if (!panel || !panel.parentElement || panel.parentElement.clientWidth > 720) return
      event.currentTarget.setPointerCapture?.(event.pointerId)
      const height = panel.getBoundingClientRect().height
      dragRef.current = { startY: event.clientY, startHeight: height, lastY: event.clientY, lastTime: event.timeStamp, velocity: 0, moved: false, height }
    },
    onPointerMove(event: ReactPointerEvent<HTMLElement>) {
      const drag = dragRef.current, panel = panelRef.current
      if (!drag || !panel?.parentElement) return
      const dy = event.clientY - drag.startY
      if (!drag.moved && Math.abs(dy) < DRAG_THRESHOLD) return
      if (!drag.moved) {
        drag.moved = true
        panel.classList.add('is-dragging')
      }
      const openHeight = sheetOpenHeight(panel.parentElement.clientHeight)
      drag.height = Math.max(SHEET_PEEK, Math.min(openHeight, drag.startHeight - dy))
      panel.style.maxHeight = `${drag.height}px`
      const elapsed = event.timeStamp - drag.lastTime
      if (elapsed > 0) drag.velocity = drag.velocity * 0.4 + (event.clientY - drag.lastY) / elapsed * 0.6
      drag.lastY = event.clientY
      drag.lastTime = event.timeStamp
    },
    onPointerUp() {
      const drag = dragRef.current, panel = panelRef.current
      if (!drag || !panel?.parentElement) return
      if (!drag.moved) {
        // 끌지 않고 눌렀으면 펼침/접힘을 바꿉니다.
        finish(panel)
        setOpen(!open)
        return
      }
      const next = sheetSnapOpen(drag.height, drag.velocity, sheetOpenHeight(panel.parentElement.clientHeight))
      dragRef.current = null
      setOpen(next)
      // 새 상태(펼침/접힘)의 CSS가 적용된 다음 프레임에 손가락 높이를 풀어, 그 자리에서 부드럽게 이어지게 합니다.
      const release = () => { panel.classList.remove('is-dragging'); panel.style.maxHeight = '' }
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(release)
      else release()
    },
    onPointerCancel() {
      if (panelRef.current) finish(panelRef.current)
    },
  }
}

// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { PointerEvent } from 'react'
import { mobilePanelOpenHeight, useMobilePanelDrag } from './useMobilePanelDrag'

afterEach(() => { cleanup(); document.body.innerHTML = '' })
function setup(width = 390) {
  const host = document.createElement('div'); host.className = 'gamcheon-map'
  Object.defineProperties(host, { clientWidth: { value: width }, clientHeight: { value: 700 } })
  const card = document.createElement('section'); host.append(card); document.body.append(host)
  card.getBoundingClientRect = () => ({ height: 240 }) as DOMRect
  const hook = renderHook(({ resetKey }) => useMobilePanelDrag({ current: card }, resetKey), { initialProps: { resetKey: 'map:a' } })
  const pointer = (y: number, time: number) => ({ button: 0, pointerId: 1, clientY: y, timeStamp: time, currentTarget: card }) as PointerEvent<HTMLElement>
  return { ...hook, card, pointer }
}
describe('모바일 패널 드래그', () => {
  it('위로 끌어 펼치고, 드래그 뒤 발생하는 클릭은 무시한다', () => {
    const { result, card, pointer } = setup()
    act(() => result.current.handleProps.onPointerDown(pointer(500, 0)))
    act(() => result.current.handleProps.onPointerMove(pointer(200, 300)))
    expect(card.style.getPropertyValue('--gm-drag-height')).toBe('540px')
    act(() => result.current.handleProps.onPointerUp(pointer(200, 310)))
    expect(result.current.position).toBe('open')
    act(() => result.current.handleProps.onClick())
    expect(result.current.position).toBe('open')
    expect(card.style.getPropertyValue('--gm-drag-height')).toBe('')
  })
  it('아래로 끌면 접히고, 선택 장소가 바뀌면 기본 크기로 돌아간다', () => {
    const { result, pointer, rerender } = setup()
    act(() => result.current.handleProps.onPointerDown(pointer(200, 0)))
    act(() => result.current.handleProps.onPointerMove(pointer(450, 300)))
    act(() => result.current.handleProps.onPointerUp(pointer(450, 310)))
    expect(result.current.position).toBe('peek')
    rerender({ resetKey: 'map:b' })
    expect(result.current.position).toBe('auto')
  })
  it('드래그 취소 시 크기를 복구하고 버튼 클릭으로도 펼칠 수 있다', () => {
    const { result, card, pointer } = setup()
    act(() => result.current.handleProps.onPointerDown(pointer(500, 0)))
    act(() => result.current.handleProps.onPointerMove(pointer(250, 200)))
    act(() => result.current.handleProps.onPointerCancel(pointer(250, 210)))
    expect(result.current.position).toBe('auto')
    expect(card.classList.contains('is-dragging')).toBe(false)
    act(() => result.current.handleProps.onClick()) // 취소 후 브라우저의 잔여 클릭 무시
    act(() => result.current.handleProps.onClick())
    expect(result.current.position).toBe('peek')
    act(() => result.current.handleProps.onClick())
    expect(result.current.position).toBe('open')
  })
  it('PC에서는 끌지 않고 작은 화면의 최대 높이를 제한한다', () => {
    const { result, card, pointer } = setup(1200)
    act(() => result.current.handleProps.onPointerDown(pointer(500, 0)))
    act(() => result.current.handleProps.onPointerMove(pointer(200, 300)))
    expect(card.style.getPropertyValue('--gm-drag-height')).toBe('')
    expect(mobilePanelOpenHeight(500)).toBe(350)
    expect(mobilePanelOpenHeight(1000)).toBe(560)
  })
})

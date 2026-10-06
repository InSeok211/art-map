// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useMyLocation } from './useMyLocation'

const rotations = vi.hoisted(() => [] as number[])
vi.mock('maplibre-gl', () => ({
  Marker: class {
    element: HTMLElement
    constructor(options: { element: HTMLElement }) { this.element = options.element }
    setLngLat() { return this }
    addTo() { return this }
    remove() {}
    getElement() { return this.element }
    setRotation(degrees: number) { rotations.push(degrees); return this }
  },
}))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  rotations.length = 0
})

describe('my location marker', () => {
  it('shows the position as soon as the map opens and turns the arrow smoothly with the compass', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'setInterval', 'clearInterval', 'performance'] })
    let report: ((position: GeolocationPosition) => void) | undefined
    vi.stubGlobal('navigator', { ...navigator, geolocation: { watchPosition: (ok: typeof report) => { report = ok; return 1 }, clearWatch: vi.fn() } })
    const easeTo = vi.fn()
    const map = { easeTo, on: vi.fn(), off: vi.fn(), getZoom: () => 16 }
    const mapRef = { current: map as never }
    const { result } = renderHook(() => useMyLocation(mapRef))
    expect(result.current.gps.status).toBe('locating')

    act(() => report!({ coords: { longitude: 129.0089102, latitude: 35.0953967, accuracy: 5, heading: null, speed: null } } as GeolocationPosition))
    expect(result.current.gps.status).toBe('ok')
    // 처음 위치를 받으면 그 자리로 화면을 옮깁니다.
    expect(easeTo).toHaveBeenCalledWith(expect.objectContaining({ center: [129.0089102, 35.0953967] }))

    const fire = (heading: number) => {
      const event = new Event('deviceorientationabsolute')
      Object.assign(event, { alpha: 360 - heading, absolute: true })
      act(() => { window.dispatchEvent(event) })
    }
    fire(0)
    expect(rotations.at(-1)).toBe(0)
    // 나침반이 90도로 바뀌면 한 번에 튀지 않고 여러 프레임에 걸쳐 돌아갑니다.
    fire(90)
    act(() => { vi.advanceTimersByTime(16) })
    const first = rotations.at(-1)!
    expect(first).toBeGreaterThan(0)
    expect(first).toBeLessThan(45)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(Math.abs(rotations.at(-1)! - 90)).toBeLessThan(1)
    // 350도 → 10도는 반대로 340도를 돌지 않고 20도만 돕니다.
    fire(350)
    act(() => { vi.advanceTimersByTime(1000) })
    fire(10)
    act(() => { vi.advanceTimersByTime(16) })
    const step = rotations.at(-1)!
    expect(step > 350 || step < 10).toBe(true)
  })

  it('turns the map with the compass while following my heading and stops when I drag the map', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'setInterval', 'clearInterval', 'performance'] })
    let report: ((position: GeolocationPosition) => void) | undefined
    vi.stubGlobal('navigator', { ...navigator, geolocation: { watchPosition: (ok: typeof report) => { report = ok; return 1 }, clearWatch: vi.fn() } })
    const handlers: Record<string, (event: { originalEvent?: unknown }) => void> = {}
    let bearing = 0
    const jumpTo = vi.fn((options: { bearing?: number }) => { if (options.bearing !== undefined) bearing = options.bearing })
    const easeTo = vi.fn()
    const rotation = { disableRotation: vi.fn(), enableRotation: vi.fn() }
    const map = {
      easeTo, jumpTo, getZoom: () => 17, getBearing: () => bearing, touchZoomRotate: rotation,
      on: (name: string, handler: (event: { originalEvent?: unknown }) => void) => { handlers[name] = handler },
      off: vi.fn(),
    }
    const { result } = renderHook(() => useMyLocation({ current: map as never }))
    // 위치가 없으면 켜지 않고 이유를 알려 줍니다.
    expect(result.current.toggleHeadingUp()).toBe('내 위치를 찾는 중입니다.')
    expect(result.current.headingUp).toBe(false)

    act(() => report!({ coords: { longitude: 129.0089102, latitude: 35.0953967, accuracy: 5, heading: null, speed: null } } as GeolocationPosition))
    const fire = (heading: number) => {
      const event = new Event('deviceorientationabsolute')
      Object.assign(event, { alpha: 360 - heading, absolute: true })
      act(() => { window.dispatchEvent(event) })
    }
    fire(40)
    act(() => { expect(result.current.toggleHeadingUp()).toBeNull() })
    expect(result.current.headingUp).toBe(true)
    expect(easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ center: [129.0089102, 35.0953967], bearing: 40 }))
    expect(rotation.disableRotation).toHaveBeenCalled()
    // 바라보는 방향을 120도로 돌리면 지도도 내 위치를 중심으로 120도 쪽으로 돕니다.
    fire(120)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(Math.abs(bearing - 120)).toBeLessThan(1)
    expect(jumpTo).toHaveBeenLastCalledWith(expect.objectContaining({ center: [129.0089102, 35.0953967] }))
    // 손으로 지도를 끌면 꺼지고, 이후에는 나침반이 바뀌어도 지도를 돌리지 않습니다.
    act(() => handlers.dragstart({ originalEvent: {} }))
    expect(result.current.headingUp).toBe(false)
    expect(rotation.enableRotation).toHaveBeenCalled()
    const calls = jumpTo.mock.calls.length
    fire(200)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(jumpTo.mock.calls.length).toBe(calls)
  })
})

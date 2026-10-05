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
})

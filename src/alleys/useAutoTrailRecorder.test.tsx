// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useAutoTrailRecorder } from './useAutoTrailRecorder'
import type { GpsTrail } from './gpsTrails'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const M_LAT = 111_320
function setup() {
  let report: ((position: GeolocationPosition) => void) | undefined
  vi.stubGlobal('navigator', { ...navigator, geolocation: { watchPosition: (ok: typeof report) => { report = ok; return 1 }, clearWatch: vi.fn() } })
  const saved: { trail: GpsTrail; keepalive: boolean }[] = []
  const hook = renderHook(({ enabled }) => useAutoTrailRecorder(enabled, (trail, { keepalive }) => { saved.push({ trail, keepalive }) }), { initialProps: { enabled: true } })
  // 북쪽으로 north m, 정확도 accuracy m, 시각 seconds 초
  const at = (north: number, seconds: number, accuracy = 6) => act(() => report!({
    coords: { longitude: 129.0095, latitude: 35.0965 + north / M_LAT, accuracy, heading: null, speed: null },
    timestamp: 1_791_500_000_000 + seconds * 1000,
  } as unknown as GeolocationPosition))
  return { hook, saved, at }
}

describe('admin auto trail recorder', () => {
  it('saves a walk but not the GPS jitter of standing still', () => {
    const { hook, saved, at } = setup()
    for (let second = 0; second < 60; second++) at(second % 2 ? 1.5 : -1.5, second) // 제자리 흔들림
    expect(hook.result.current.pointCount).toBe(1)
    for (let step = 1; step <= 12; step++) at(step * 5, 60 + step * 4) // 60m 걸음
    expect(hook.result.current.pointCount).toBe(13)
    hook.unmount()
    expect(saved).toHaveLength(1)
    expect(saved[0].keepalive).toBe(true)
    expect(saved[0].trail.points).toHaveLength(13)
  })

  it('drops inaccurate fixes and does not upload a short trail', () => {
    const { hook, saved, at } = setup()
    at(0, 0)
    at(40, 5, 45) // 정확도 45m: 버림
    at(10, 10)
    hook.unmount()
    expect(saved).toHaveLength(0)
  })

  it('starts a separate trail after a long pause', () => {
    const { hook, saved, at } = setup()
    for (let step = 0; step <= 10; step++) at(step * 5, step * 4)
    for (let step = 0; step <= 10; step++) at(step * 5, 20 * 60 + step * 4) // 20분 뒤 다시 걷기
    hook.unmount()
    expect(saved).toHaveLength(2)
    expect(saved[0].trail.id).not.toBe(saved[1].trail.id)
  })

  it('records nothing until enabled (non-admins)', () => {
    let watched = false
    vi.stubGlobal('navigator', { ...navigator, geolocation: { watchPosition: () => { watched = true; return 1 }, clearWatch: vi.fn() } })
    renderHook(() => useAutoTrailRecorder(false, () => {}))
    expect(watched).toBe(false)
  })
})

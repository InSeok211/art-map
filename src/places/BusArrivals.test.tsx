// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BusArrivals } from './BusArrivals'
import type { Place } from '../types'

vi.mock('../data/busStopLinks', () => ({ busStopIdsFor: (id: string) => id === 'linked' ? ['123'] : undefined }))
const stop: Place = { id: 'linked', name: '정류장', category: 'bus_stop', latitude: 35.1, longitude: 129 }
const response = { arrivals: [{ route: '사하구1', type: '마을버스', first: { minutes: 3, status: null, stopsAway: 2 }, second: null }], updatedAt: '2026-10-24T08:00:00Z' }
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('버스 도착정보 이용 흐름', () => {
  it('선택 후 자동 조회하고 갱신 실패에도 직전 정보를 유지한다', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => response }).mockRejectedValueOnce(new Error('network'))
    vi.stubGlobal('fetch', fetcher)
    render(<BusArrivals place={stop} />)
    expect(await screen.findByText('사하구1')).toBeTruthy()
    expect(screen.getByText('앞차 3분 · 2정류소 전')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '새로고침' }))
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeTruthy()
    expect(screen.getByText('사하구1')).toBeTruthy()
  })
  it('연결되지 않은 정류장은 이유를 안내하고 요청하지 않는다', () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    render(<BusArrivals place={{ ...stop, id: 'unlinked' }} />)
    expect(screen.getByText(/아직 실시간 도착정보가 연결되지/)).toBeTruthy()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('빈 도착정보와 오류를 구분한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...response, arrivals: [] }) }))
    render(<BusArrivals place={stop} />)
    expect(await screen.findByText(/현재 제공되는 도착정보가 없습니다/)).toBeTruthy()
  })
  it('보이지 않는 화면에서는 요청하지 않고, 해제할 때 요청을 취소한다', async () => {
    let visible: ((entries: { isIntersecting: boolean }[]) => void) | undefined
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: typeof visible) { visible = callback }
      observe() {} disconnect() {}
    })
    const fetcher = vi.fn().mockImplementation(() => new Promise(() => {})); vi.stubGlobal('fetch', fetcher)
    const view = render(<BusArrivals place={stop} />)
    expect(fetcher).not.toHaveBeenCalled()
    visible?.([{ isIntersecting: true }])
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    const signal = fetcher.mock.calls[0][1].signal as AbortSignal
    view.unmount()
    expect(signal.aborted).toBe(true)
  })
})

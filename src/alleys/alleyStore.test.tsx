// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useAlleyStore } from './alleyStore'
import type { Alley } from './alleys'
import type { GpsTrail } from './gpsTrails'

const ALLEYS = '/api/admin/map-alleys'
const TRAILS = '/api/admin/gps-trails'
const alley = (id: string, widthMeters = 3): Alley => ({ id, coordinates: [[129.009, 35.095], [129.0095, 35.0955]], widthMeters })
const trail: GpsTrail = { id: 't1', startedAt: '2026-03-01', points: [[129.009, 35.095, 5, 0], [129.0091, 35.095, 5, 1000]] }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

// 지도 앱 서버 자리에 두는 가짜 응답입니다. 저장 요청을 기록하고, 필요하면 응답을 붙잡아 둡니다.
function stubServer({ alleys = [] as Alley[], trails = [] as GpsTrail[], load = 200 } = {}) {
  const puts: { alleys: Alley[]; dismissed: unknown[] }[] = []
  const held: ((response: Response) => void)[] = []
  const state = { hold: false, putStatus: 200, trailStatus: 200, deleteStatus: 200 }
  vi.stubGlobal('fetch', vi.fn(async (path: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET'
    if (path === ALLEYS && method === 'GET') return load === 200 ? json({ alleys, dismissed: [] }) : json({ error: 'no' }, load)
    if (path === TRAILS && method === 'GET') return json({ trails })
    if (path === ALLEYS && method === 'PUT') {
      puts.push(JSON.parse(String(init.body)))
      if (state.hold) return new Promise<Response>((resolve) => held.push(resolve))
      return json({ ok: true }, state.putStatus)
    }
    if (path === TRAILS && method === 'POST') {
      const sent = JSON.parse(String(init.body)) as GpsTrail
      return state.trailStatus === 200 ? json({ trail: { ...sent, startedAt: 'cleaned-by-server' } }) : json({ error: 'no' }, state.trailStatus)
    }
    if (path.startsWith(`${TRAILS}?`) && method === 'DELETE') return json({ ok: true }, state.deleteStatus)
    throw new Error(`unexpected ${method} ${path}`)
  }))
  return { puts, held, state }
}

const tick = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

async function hostedStore(options?: Parameters<typeof stubServer>[0]) {
  document.documentElement.dataset.buildingEditServer = 'true'
  const server = stubServer(options)
  const hook = renderHook(() => useAlleyStore())
  await tick()
  return { ...hook, ...server }
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('data-building-edit-server')
  localStorage.clear()
})

describe('개발 미리보기(서버 없음)', () => {
  it('고친 골목길을 이 브라우저에 저장해 다시 열어도 남아 있고 서버로 보내지 않는다', async () => {
    const { puts } = stubServer()
    const first = renderHook(() => useAlleyStore())
    act(() => first.result.current.updateAlleys([alley('a1')]))
    await tick(1000)
    first.unmount()

    expect(renderHook(() => useAlleyStore()).result.current.alleys).toEqual([alley('a1')])
    expect(puts).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('저장된 값이 깨져 있으면 빈 목록으로 시작한다', () => {
    localStorage.setItem('gamcheon-map-alleys-v1', '{broken')
    expect(renderHook(() => useAlleyStore()).result.current.alleys).toEqual([])
  })
})

describe('서버 불러오기', () => {
  it('서버 값이 이 브라우저에 남은 값보다 우선한다', async () => {
    localStorage.setItem('gamcheon-map-alleys-v1', JSON.stringify([alley('stale')]))
    const { result } = await hostedStore({ alleys: [alley('server')] })
    expect(result.current.ready).toBe(true)
    expect(result.current.server).toBe(true)
    expect(result.current.alleys).toEqual([alley('server')])
  })

  it('불러오지 못하면 안내하고, 빈 목록으로 서버 값을 덮어쓰지 못하게 수정을 막는다', async () => {
    const { result, puts } = await hostedStore({ load: 500 })
    expect(result.current.ready).toBe(false)
    expect(result.current.notice).toMatch(/불러오지 못했습니다/)

    act(() => result.current.updateAlleys([alley('a1')]))
    await tick(1000)
    expect(result.current.alleys).toEqual([])
    expect(puts).toEqual([])
    await expect(result.current.gpsTrails.onAddTrail(trail)).rejects.toThrow(/불러온 뒤/)
  })
})

describe('자동 저장', () => {
  it('점을 끄는 동안의 여러 수정을 800ms 뒤 최신 값 한 번으로 저장한다', async () => {
    const { result, puts } = await hostedStore()
    act(() => result.current.updateAlleys([alley('a1', 2)]))
    await tick(500)
    act(() => result.current.updateAlleys([alley('a1', 4)]))
    await tick(799)
    expect(puts).toEqual([])
    await tick(1)
    expect(puts).toEqual([{ alleys: [alley('a1', 4)], dismissed: [] }])
  })

  it('버린 후보도 골목길과 함께 저장한다', async () => {
    const { result, puts } = await hostedStore({ alleys: [alley('a1')] })
    const line = alley('x').coordinates
    act(() => result.current.gpsTrails.onDismiss(line))
    await tick(800)
    expect(puts).toEqual([{ alleys: [alley('a1')], dismissed: [line] }])
  })

  it('저장에 실패하면 서버 오류를 안내하고, 다음 수정이 성공하면 안내를 지운다', async () => {
    const { result, state } = await hostedStore()
    state.putStatus = 400
    act(() => result.current.updateAlleys([alley('a1')]))
    await tick(800)
    expect(result.current.notice).toMatch(/저장하지 못했습니다/)

    state.putStatus = 200
    act(() => result.current.updateAlleys([alley('a2')]))
    await tick(800)
    expect(result.current.notice).toBe('')
  })
})

describe('저장 순서', () => {
  it('앞선 저장이 끝나기 전에는 다음 저장을 보내지 않아, 늦게 끝난 옛 값이 새 값을 덮지 못한다', async () => {
    const { result, puts, held, state } = await hostedStore()
    state.hold = true
    act(() => result.current.updateAlleys([alley('a1', 2)]))
    await tick(800)
    expect(puts).toHaveLength(1)

    act(() => result.current.updateAlleys([alley('a1', 4)]))
    await tick(800)
    expect(puts).toHaveLength(1)

    await act(async () => { held[0](json({ ok: true })); await vi.advanceTimersByTimeAsync(0) })
    expect(puts).toHaveLength(2)
    expect(puts[1].alleys).toEqual([alley('a1', 4)])
  })

  it('앞선 저장이 실패해도 기다리던 수정은 이어서 저장한다', async () => {
    const { result, puts, held, state } = await hostedStore()
    state.hold = true
    act(() => result.current.updateAlleys([alley('a1', 2)]))
    await tick(800)
    act(() => result.current.updateAlleys([alley('a1', 4)]))
    await tick(800)

    await act(async () => { held[0](json({ error: '일시 오류' }, 500)); await vi.advanceTimersByTimeAsync(0) })
    expect(puts).toHaveLength(2)
    expect(puts[1].alleys).toEqual([alley('a1', 4)])
  })
})

describe('저장 전에 페이지를 떠날 때', () => {
  const leaving = () => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  }

  it('고친 내용이 저장되기 전이면 경고하고, 저장이 끝나면 경고하지 않는다', async () => {
    const { result, held, state } = await hostedStore()
    expect(leaving()).toBe(false)

    state.hold = true
    act(() => result.current.updateAlleys([alley('a1')]))
    expect(leaving()).toBe(true)
    await tick(800)
    expect(leaving()).toBe(true)

    await act(async () => { held[0](json({ ok: true })); await vi.advanceTimersByTimeAsync(0) })
    expect(leaving()).toBe(false)
  })

  it('저장 중에 또 고쳤으면 앞선 저장이 끝나도 계속 경고한다', async () => {
    const { result, held, state } = await hostedStore()
    state.hold = true
    act(() => result.current.updateAlleys([alley('a1', 2)]))
    await tick(800)
    act(() => result.current.updateAlleys([alley('a1', 4)]))

    await act(async () => { held[0](json({ ok: true })); await vi.advanceTimersByTimeAsync(0) })
    expect(leaving()).toBe(true)
  })

  it('저장에 실패한 내용이 남아 있으면 계속 경고한다', async () => {
    const { result, state } = await hostedStore()
    state.putStatus = 500
    act(() => result.current.updateAlleys([alley('a1')]))
    await tick(800)
    expect(result.current.notice).not.toBe('')
    expect(leaving()).toBe(true)
  })

  it('이 브라우저에 바로 저장되는 개발 미리보기에서는 경고하지 않는다', async () => {
    stubServer()
    const { result } = renderHook(() => useAlleyStore())
    act(() => result.current.updateAlleys([alley('a1')]))
    expect(leaving()).toBe(false)
  })
})

describe('GPS 기록', () => {
  it('서버가 정리해 돌려준 기록으로 목록을 채운다', async () => {
    const { result } = await hostedStore()
    await act(async () => { await result.current.gpsTrails.onAddTrail(trail) })
    expect(result.current.gpsTrails.trails.map((item) => item.startedAt)).toEqual(['cleaned-by-server'])
  })

  it('올리지 못하면 호출한 쪽에 실패를 알리고 목록에 넣지 않는다', async () => {
    const { result, state } = await hostedStore()
    state.trailStatus = 500
    await act(async () => { await expect(result.current.gpsTrails.onAddTrail(trail)).rejects.toThrow() })
    expect(result.current.gpsTrails.trails).toEqual([])
  })

  it('지우지 못하면 안내한다', async () => {
    const { result, state } = await hostedStore({ trails: [trail] })
    state.deleteStatus = 500
    act(() => result.current.gpsTrails.onDeleteTrail('t1'))
    await tick()
    expect(result.current.notice).toMatch(/지우지 못했습니다/)
  })
})

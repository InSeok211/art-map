// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useBuildingEditStore } from './buildingEditStore'
import { EMPTY_BUILDING_EDITS, setOverride } from './buildingEdits'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
})
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('data-building-edit-server')
  localStorage.clear()
})

describe('building edit persistence', () => {
  it('persists undo and redo locally and keeps the public revision unchanged', () => {
    const { result } = renderHook(() => useBuildingEditStore())
    act(() => result.current.onChange(setOverride(EMPTY_BUILDING_EDITS, 123, { heightMeters: 12 })))
    act(() => result.current.onUndo?.())
    expect(JSON.parse(localStorage.getItem('gamcheon-building-draft-v1')!)).toEqual(EMPTY_BUILDING_EDITS)
    act(() => result.current.onRedo?.())
    expect(result.current.draft.overrides[123].heightMeters).toBe(12)
    expect(result.current.published).toEqual(EMPTY_BUILDING_EDITS)
  })
  it('does not publish locally when the hosted admin API fails to load', async () => {
    document.documentElement.dataset.buildingEditServer = 'true'
    const fetch = vi.fn().mockResolvedValue(json({ error: 'Forbidden' }, 403))
    vi.stubGlobal('fetch', fetch)
    const { result } = renderHook(() => useBuildingEditStore())
    await waitFor(() => expect(result.current.status).toMatch(/불러오지 못했습니다/))
    act(() => {
      result.current.onChange(setOverride(EMPTY_BUILDING_EDITS, 123, { hidden: true }))
      result.current.onPublish()
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('gamcheon-building-published-v1')).toBeNull()
  })

  it('waits for an in-flight draft save before discarding it', async () => {
    document.documentElement.dataset.buildingEditServer = 'true'
    const pendingSave = deferred<Response>()
    const requests: string[] = []
    vi.stubGlobal('fetch', vi.fn((path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      requests.push(`${method} ${path}`)
      if (method === 'GET') return Promise.resolve(json({ draft: EMPTY_BUILDING_EDITS, published: EMPTY_BUILDING_EDITS }))
      if (method === 'PUT') return pendingSave.promise
      return Promise.resolve(json({ draft: EMPTY_BUILDING_EDITS }))
    }))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { result } = renderHook(() => useBuildingEditStore())
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    act(() => result.current.onChange(setOverride(EMPTY_BUILDING_EDITS, 123, { hidden: true })))
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    expect(requests).toContain('PUT /api/admin/map-buildings')
    act(() => result.current.onDiscard())
    expect(requests).not.toContain('POST /api/admin/map-buildings/discard')
    await act(async () => { pendingSave.resolve(json({})); await Promise.resolve(); await Promise.resolve() })
    vi.useRealTimers()
    await waitFor(() => expect(requests).toContain('POST /api/admin/map-buildings/discard'))
  })
})

// 묶음 저장·순서의 자세한 규칙은 useAutosave.test.tsx에 있습니다. 여기서는 공개·되돌리기와 맞물리는 동작을 봅니다.
describe('서버 초안 저장', () => {
  const API = '/api/admin/map-buildings'
  const edit = (heightMeters: number) => setOverride(EMPTY_BUILDING_EDITS, 123, { heightMeters })
  const tick = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
  const leaving = () => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  }

  async function hostedStore() {
    document.documentElement.dataset.buildingEditServer = 'true'
    vi.useFakeTimers()
    const requests: string[] = []
    const puts: unknown[] = []
    const held: ((response: Response) => void)[] = []
    const state = { hold: false, putStatus: 200, discardStatus: 200 }
    vi.stubGlobal('fetch', vi.fn((path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (method === 'GET') return Promise.resolve(json({ draft: EMPTY_BUILDING_EDITS, published: EMPTY_BUILDING_EDITS }))
      requests.push(`${method} ${path}`)
      if (method === 'PUT') {
        puts.push((JSON.parse(String(init?.body)) as { draft: unknown }).draft)
        if (state.hold) return new Promise<Response>((resolve) => held.push(resolve))
        return Promise.resolve(state.putStatus === 200 ? json({}) : json({ error: '저장 오류' }, state.putStatus))
      }
      if (path === `${API}/publish`) return Promise.resolve(json({ published: edit(12) }))
      if (state.discardStatus !== 200) return Promise.resolve(json({ error: '되돌리기 오류' }, state.discardStatus))
      return Promise.resolve(json({ draft: EMPTY_BUILDING_EDITS }))
    }))
    const hook = renderHook(() => useBuildingEditStore())
    await tick()
    return { ...hook, requests, puts, held, state }
  }

  it('저장되기 전에 페이지를 떠나면 경고하고, 저장이 끝나면 경고하지 않는다', async () => {
    const { result } = await hostedStore()
    expect(leaving()).toBe(false)
    act(() => result.current.onChange(edit(12)))
    expect(leaving()).toBe(true)
    await tick(700)
    expect(leaving()).toBe(false)
  })

  it('연속 수정을 700ms 모았다가 최신 값으로 저장한다', async () => {
    const { result, puts } = await hostedStore()
    act(() => result.current.onChange(edit(10)))
    act(() => result.current.onChange(edit(12)))
    await tick(699)
    expect(puts).toEqual([])
    await tick(1)
    expect(puts).toEqual([edit(12)])
  })

  it('자동 저장에 실패하면 안내하고, 다음 저장이 성공하면 안내를 지운다', async () => {
    const { result, state } = await hostedStore()
    state.putStatus = 500
    act(() => result.current.onChange(edit(10)))
    await tick(700)
    expect(result.current.status).toBe('초안을 저장하지 못했습니다: 저장 오류')

    state.putStatus = 200
    act(() => result.current.onChange(edit(12)))
    await tick(700)
    expect(result.current.status).toBe('')
  })

  it('느린 저장 중에 쌓인 수정은 끝난 뒤 최신 값 하나만 보낸다', async () => {
    const { result, puts, held, state } = await hostedStore()
    state.hold = true
    act(() => result.current.onChange(edit(10)))
    await tick(700)
    act(() => result.current.onChange(edit(11)))
    await tick(700)
    act(() => result.current.onChange(edit(12)))
    await tick(700)
    await act(async () => { held[0](json({})); await vi.advanceTimersByTimeAsync(0) })
    expect(puts).toEqual([edit(10), edit(12)])
  })

  it('공개하기는 남은 수정을 먼저 저장한 뒤 공개한다', async () => {
    const { result, requests, puts } = await hostedStore()
    act(() => result.current.onChange(edit(12)))
    act(() => result.current.onPublish())
    await tick()
    expect(requests).toEqual(['PUT /api/admin/map-buildings', 'POST /api/admin/map-buildings/publish'])
    expect(puts).toEqual([edit(12)])
    expect(result.current.status).toMatch(/반영했습니다/)
  })

  it('고친 내용이 없으면 저장 없이 공개한다', async () => {
    const { result, requests } = await hostedStore()
    act(() => result.current.onPublish())
    await tick()
    expect(requests).toEqual(['POST /api/admin/map-buildings/publish'])
  })

  it('공개 전 저장이 실패하면 공개하지 않고 안내하며, 경고를 유지한다', async () => {
    const { result, requests, state } = await hostedStore()
    state.putStatus = 500
    act(() => result.current.onChange(edit(12)))
    act(() => result.current.onPublish())
    await tick()
    expect(requests).toEqual(['PUT /api/admin/map-buildings'])
    expect(result.current.status).toMatch(/저장 오류/)
    expect(leaving()).toBe(true)
  })

  it('되돌리기는 남은 수정을 저장하지 않고 버린다', async () => {
    const { result, requests } = await hostedStore()
    act(() => result.current.onChange(edit(12)))
    act(() => result.current.onDiscard())
    await tick(700)
    expect(requests).toEqual(['POST /api/admin/map-buildings/discard'])
    expect(result.current.draft).toEqual(EMPTY_BUILDING_EDITS)
    expect(leaving()).toBe(false)
  })

  it('되돌리기가 실패하면 화면에 남은 수정을 잃지 않게 다시 저장한다', async () => {
    const { result, puts, state } = await hostedStore()
    state.discardStatus = 500
    state.hold = true
    act(() => result.current.onChange(edit(12)))
    act(() => result.current.onDiscard())
    await tick()
    expect(result.current.status).toMatch(/되돌리기 오류/)
    expect(result.current.draft).toEqual(edit(12))
    expect(leaving()).toBe(true)
    await tick(700)
    expect(puts).toEqual([edit(12)])
  })
})

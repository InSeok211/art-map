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

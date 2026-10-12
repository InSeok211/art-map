// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useSiteBuildingEdits } from './siteBuildingEdits'

// 테스트 환경(localhost·개발 모드)에서도 서버 공개본을 읽는 실제 경로를 확인합니다.
vi.mock('./publicPreview', () => ({ LOCAL_PUBLIC_PREVIEW: false, PUBLISHED_ALLEYS_KEY: 'gamcheon-map-alleys-v1' }))

const response = (edits: unknown) => new Response(JSON.stringify({ edits }), {
  headers: { 'content-type': 'application/json' },
})
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

it('shows the map after the startup timeout and applies a late building response', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  const pending = deferred<Response>()
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending.promise))
  const { result } = renderHook(() => useSiteBuildingEdits())
  expect(result.current).toBeNull()
  act(() => vi.advanceTimersByTime(1500))
  expect(result.current).toEqual({ overrides: {}, added: [], models: [] })
  await act(async () => { pending.resolve(response({ overrides: { 123: { hidden: true } }, added: [] })); await Promise.resolve() })
  expect(result.current?.overrides['123']).toEqual({ hidden: true })
})

it('refreshes an already open map when the published edit changes', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  let version = 0
  const fetch = vi.fn(() => Promise.resolve(response({ overrides: version ? { 123: { hidden: true } } : {}, added: [] })))
  vi.stubGlobal('fetch', fetch)
  const { result } = renderHook(() => useSiteBuildingEdits())
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  expect(result.current?.overrides).toEqual({})
  version = 1
  await act(async () => { vi.advanceTimersByTime(60_000); await Promise.resolve(); await Promise.resolve() })
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(result.current?.overrides['123']).toEqual({ hidden: true })
})

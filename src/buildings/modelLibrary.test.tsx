// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useModelLibrary } from './modelLibrary'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('does not save an admin model locally while server availability is unknown', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  const { result } = renderHook(() => useModelLibrary(null))
  let saved: unknown
  await act(async () => {
    saved = await result.current.upload(new File(['not-a-glb'], 'building.glb'))
  })
  expect(saved).toBeNull()
  expect(result.current.error).toMatch(/저장소.*확인/)
  expect(fetch).not.toHaveBeenCalled()
})

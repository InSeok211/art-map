// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { installEditToken } from './studioAuth'

afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear() })

it('takes the pass out of the address and sends it only to this app API', async () => {
  const seen: [string, string | null][] = []
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    seen.push([String(input), new Headers(init?.headers).get('authorization')])
    return Promise.resolve(new Response('{}'))
  }))
  window.history.replaceState(null, '', '/studio/#editToken=abc.def')
  installEditToken()
  expect(window.location.hash).toBe('')
  await fetch('/api/admin/map-buildings', { headers: { 'content-type': 'application/json' } })
  await fetch('/assets/model.glb')
  await fetch('https://example.com/api/admin/map-buildings')
  expect(seen).toEqual([
    ['/api/admin/map-buildings', 'Bearer abc.def'],
    ['/assets/model.glb', null],
    ['https://example.com/api/admin/map-buildings', null],
  ])
})

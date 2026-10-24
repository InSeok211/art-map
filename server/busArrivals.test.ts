import { afterEach, describe, expect, it, vi } from 'vitest'
import { busArrivals, parseBusArrivals } from './busArrivals'
import type { MapEnv } from './env'

const xml = '<response><header><resultCode>00</resultCode></header><items><item><lineno>사하구1-1</lineno><min1>2</min1><station1>2</station1><min2>운행대기</min2></item><item><lineno>서구2-2</lineno></item></items></response>'
afterEach(() => vi.unstubAllGlobals())
describe('bus arrivals', () => {
  it('keeps missing buses distinct from zero minutes and waiting', () => {
    const rows = parseBusArrivals(xml)
    expect(rows[0].first).toEqual({ minutes: 2, status: null, stopsAway: 2 })
    expect(rows[0].second).toEqual({ minutes: null, status: '운행대기', stopsAway: null })
    expect(rows[1].first).toBeNull()
    expect(parseBusArrivals(xml.replace('<min1>2', '<min1>0'))[0].first?.minutes).toBe(0)
    expect(() => parseBusArrivals('<resultCode>30</resultCode>')).toThrow()
  })
  it('rejects unknown stops without requesting arbitrary upstream ids', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    expect((await busArrivals({} as MapEnv, new URL('https://map.test/api/map-bus-arrivals?placeId=arbitrary'))).status).toBe(404)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('fetches and caches a known stop without leaking the key', async () => {
    const fetch = vi.fn(async (_url: URL) => new Response(xml)); vi.stubGlobal('fetch', fetch)
    const url = new URL('https://map.test/api/map-bus-arrivals?placeId=busan-BSB215880201')
    const env = { busanBusApiKey: 'private%2Bkey' } as MapEnv
    const response = await busArrivals(env, url)
    expect(response.status).toBe(200)
    expect(await response.text()).not.toContain('private')
    await busArrivals(env, url)
    // 이 표식에는 마을버스·시내버스(61번) 정류소 번호가 함께 있어 두 번호를 한 번씩만 묻습니다.
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls.map((call) => new URL(String(call[0])).searchParams.get('bstopid'))).toEqual(['215880201', '517430000'])
  })

  it('merges every stop number of one marker and keeps partial results', async () => {
    const fetch = vi.fn(async (url: URL) => url.searchParams.get('bstopid') === '519030000'
      ? new Response('error', { status: 500 })
      : new Response(xml.replace('<min1>2', '<min1>7')))
    vi.stubGlobal('fetch', fetch)
    const response = await busArrivals({ busanBusApiKey: 'k' } as MapEnv, new URL('https://map.test/api/map-bus-arrivals?placeId=busan-BSB168590202'))
    expect(response.status).toBe(200)
    const body = await response.json() as { stopIds: string[]; arrivals: { route: string }[] }
    expect(body.stopIds).toEqual(['168590202'])
    expect(body.arrivals.map((item) => item.route)).toEqual(['사하구1-1', '서구2-2'])
  })
})
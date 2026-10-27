import { busStopIdsFor } from '../src/data/busStopLinks'
import type { MapEnv } from './env'
import { error, json } from './http'
const cache = new Map<string, { until: number; value: unknown }>()
const pending = new Map<string, Promise<unknown>>()
// 실패한 정류소 번호는 잠시 다시 묻지 않습니다. 공공데이터포털이 느리거나 장애일 때 요청마다 8초짜리 호출이
// 반복되고 일일 호출 한도가 소진되는 것을 막습니다(성공 캐시와 같은 30초).
const failedUntil = new Map<string, number>()
const CACHE_MS = 30_000

/** 테스트에서 모듈 캐시를 비울 때 씁니다. */
export function resetBusArrivalsCache() {
  cache.clear(); pending.clear(); failedUntil.clear()
}
const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
function field(xml: string, tag: string) {
  return decode(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`).exec(xml)?.[1]?.trim() ?? '').slice(0, 100)
}
function nextBus(xml: string, n: number) {
  const value = field(xml, `min${n}`)
  if (!value) return null
  const minutes = /^\d+$/.test(value) ? Number(value) : null
  const count = field(xml, `station${n}`)
  return { minutes, status: minutes === null ? value : null, stopsAway: /^\d+$/.test(count) ? Number(count) : null }
}
export function parseBusArrivals(xml: string) {
  if (field(xml, 'resultCode') !== '00') throw new Error('upstream service error')
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)].map(([, item]) => ({
    route: field(item, 'lineno'), type: field(item, 'bustype'),
    first: nextBus(item, 1), second: nextBus(item, 2),
  })).filter(item => item.route)
}

type StopArrivals = { stopId: string; arrivals: ReturnType<typeof parseBusArrivals>; updatedAt: string }

// 정류소 번호 하나의 도착정보(30초 동안 다시 씀, 같은 번호를 동시에 여러 번 묻지 않음)
async function stopArrivals(key: string, stopId: string): Promise<StopArrivals> {
  const saved = cache.get(stopId)
  if (saved && saved.until > Date.now()) return saved.value as StopArrivals
  const failed = failedUntil.get(stopId)
  if (failed && failed > Date.now()) throw new Error('upstream recently failed')
  let job = pending.get(stopId) as Promise<StopArrivals> | undefined
  if (!job) {
    job = (async () => {
      try {
        let decodedKey = key
        try { decodedKey = decodeURIComponent(key) } catch { /* An unencoded key is also accepted. */ }
        const upstream = new URL('https://apis.data.go.kr/6260000/BusanBIMS/stopArrByBstopid')
        upstream.searchParams.set('serviceKey', decodedKey)
        upstream.searchParams.set('bstopid', stopId)
        const response = await fetch(upstream, { signal: AbortSignal.timeout(8000) })
        if (!response.ok) throw new Error('upstream request failed')
        const xml = await response.text()
        if (xml.length > 1_000_000) throw new Error('upstream response too large')
        const value = { stopId, arrivals: parseBusArrivals(xml), updatedAt: new Date().toISOString() }
        cache.set(stopId, { until: Date.now() + CACHE_MS, value })
        failedUntil.delete(stopId)
        return value
      } catch (cause) {
        failedUntil.set(stopId, Date.now() + CACHE_MS)
        throw cause
      }
    })()
    pending.set(stopId, job)
    const settled = job
    settled.catch(() => undefined).finally(() => { if (pending.get(stopId) === settled) pending.delete(stopId) })
  }
  return job
}

// 한 표식에 묶인 정류소 번호(마을버스·시내버스)를 모두 조회해 노선을 합칩니다. 일부만 실패하면 받은 것만 보여 줍니다.
export async function busArrivals(env: MapEnv, url: URL) {
  const placeId = url.searchParams.get('placeId') ?? ''
  const stopIds = busStopIdsFor(placeId)
  if (!stopIds?.length) return error('이 정류장은 도착정보 연결을 준비 중입니다.', 404)
  if (!env.busanBusApiKey) return error('버스 도착정보 서비스 연결을 준비 중입니다.', 503)
  const key = env.busanBusApiKey
  const results = await Promise.allSettled(stopIds.map((stopId) => stopArrivals(key, stopId)))
  const ok = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
  if (!ok.length) return error('도착정보를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.', 502)
  const soon = (item: StopArrivals['arrivals'][number]) => item.first?.minutes ?? Number.POSITIVE_INFINITY
  return json({
    stopIds: ok.map((item) => item.stopId),
    arrivals: ok.flatMap((item) => item.arrivals).sort((a, b) => soon(a) - soon(b)),
    updatedAt: ok.map((item) => item.updatedAt).sort()[0],
  })
}
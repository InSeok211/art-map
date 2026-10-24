import { busStopIdFor } from '../src/data/busStopLinks'
import type { MapEnv } from './env'
import { error, json } from './http'
const cache = new Map<string, { until: number; value: unknown }>()
const pending = new Map<string, Promise<unknown>>()
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

export async function busArrivals(env: MapEnv, url: URL) {
  const placeId = url.searchParams.get('placeId') ?? ''
  const stopId = busStopIdFor(placeId)
  if (!stopId) return error('이 정류장은 도착정보 연결을 준비 중입니다.', 404)
  if (!env.busanBusApiKey) return error('버스 도착정보 서비스 연결을 준비 중입니다.', 503)
  const saved = cache.get(stopId)
  if (saved && saved.until > Date.now()) return json(saved.value)
  let job = pending.get(stopId)
  if (!job) {
    const key = env.busanBusApiKey
    job = (async () => {
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
      cache.set(stopId, { until: Date.now() + 30_000, value })
      return value
    })()
    pending.set(stopId, job)
  }
  try { return json(await job) }
  catch { return error('도착정보를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.', 502) }
  finally { if (pending.get(stopId) === job) pending.delete(stopId) }
}

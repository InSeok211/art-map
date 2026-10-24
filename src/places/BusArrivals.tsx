import { useEffect, useRef, useState } from 'react'
import { busStopIdFor } from '../data/busStopLinks'
import type { Place } from '../types'

type Bus = { minutes: number | null; status: string | null; stopsAway: number | null }
type Arrival = { route: string; type: string; first: Bus | null; second: Bus | null }
type Data = { arrivals: Arrival[]; updatedAt: string }
function busText(bus: Bus | null) {
  if (!bus) return '도착정보 없음'
  const time = bus.minutes === null ? bus.status || '도착정보 없음' : bus.minutes === 0 ? '곧 도착' : `${bus.minutes}분`
  return `${time}${bus.stopsAway === null ? '' : ` · ${bus.stopsAway}정류소 전`}`
}
export function BusArrivals({ place }: { place: Place }) {
  const [data, setData] = useState<Data | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const request = useRef<AbortController | null>(null)
  useEffect(() => {
    setData(null); setNotice(''); setBusy(false)
    return () => { request.current?.abort() }
  }, [place.id])
  // 도착정보를 연결한 정류장에만 보여 줍니다(나머지는 눌러도 '준비 중'만 나오므로 숨김).
  if (place.category !== 'bus_stop' || !busStopIdFor(place.id)) return null
  async function refresh() {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setBusy(true); setNotice(''); setData(null)
    try {
      const response = await fetch(`/api/map-bus-arrivals?placeId=${encodeURIComponent(place.id)}`, { signal: controller.signal, cache: 'no-store' })
      const body = await response.json() as Data & { error?: string }
      if (!response.ok) throw new Error(body.error || '도착정보를 불러오지 못했습니다.')
      if (!controller.signal.aborted) setData(body)
    } catch (cause) {
      if (!controller.signal.aborted) setNotice(cause instanceof Error ? cause.message : '도착정보를 불러오지 못했습니다.')
    } finally { if (!controller.signal.aborted) setBusy(false) }
  }
  return <section className="map-bus-arrivals" aria-label="버스 도착정보">
    <div className="map-bus-arrivals__head"><strong>버스 도착 예정</strong><button type="button" disabled={busy} onClick={() => void refresh()}>{busy ? '조회 중…' : data ? '새로고침' : '도착정보 보기'}</button></div>
    {notice && <p role="status">{notice}</p>}
    {data && <>
      {data.arrivals.length ? <ul>{data.arrivals.map((item, index) => <li key={`${item.route}-${index}`}><strong>{item.route}</strong><span>앞차 {busText(item.first)}</span>{item.second && <span>뒷차 {busText(item.second)}</span>}</li>)}</ul> : <p>현재 제공되는 도착정보가 없습니다.</p>}
      <small>{new Date(data.updatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Seoul' })} 조회 · 교통 상황에 따라 달라질 수 있습니다.</small>
    </>}
  </section>
}

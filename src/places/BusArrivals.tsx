import { useCallback, useEffect, useRef, useState } from 'react'
import { busStopIdsFor } from '../data/busStopLinks'
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
  const section = useRef<HTMLElement>(null)
  const supported = place.category === 'bus_stop' && Boolean(busStopIdsFor(place.id))
  const refresh = useCallback(async () => {
    if (!supported) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setBusy(true); setNotice('')
    try {
      const response = await fetch(`/api/map-bus-arrivals?placeId=${encodeURIComponent(place.id)}`, { signal: controller.signal, cache: 'no-store' })
      const body = await response.json() as Data & { error?: string }
      if (!response.ok) throw new Error(body.error || '도착정보를 불러오지 못했습니다.')
      if (!controller.signal.aborted) setData(body)
    } catch (cause) {
      if (!controller.signal.aborted) setNotice('도착정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally { if (!controller.signal.aborted) setBusy(false) }
  }, [place.id, supported])
  useEffect(() => {
    setData(null); setNotice(''); setBusy(false)
    if (!supported) return
    // PC·모바일 화면이 함께 마운트되므로 실제 보이는 정보 영역만 조회합니다.
    let started = false
    const load = () => { if (!started) { started = true; void refresh() } }
    const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) load()
    }) : null
    if (observer && section.current) observer.observe(section.current)
    else load()
    return () => { observer?.disconnect(); request.current?.abort() }
  }, [refresh, supported])
  if (place.category !== 'bus_stop') return null
  return <section ref={section} className="map-bus-arrivals" aria-label="버스 도착정보" aria-busy={busy}>
    <div className="map-bus-arrivals__head"><strong>버스 도착 예정</strong>{supported && <button type="button" disabled={busy} onClick={() => void refresh()}>{busy ? '조회 중…' : notice ? '다시 시도' : '새로고침'}</button>}</div>
    {!supported && <p>이 정류장은 아직 실시간 도착정보가 연결되지 않았습니다.</p>}
    {supported && busy && !data && <p role="status">버스 도착정보를 불러오는 중입니다.</p>}
    {notice && <p role="status">{notice}</p>}
    {data && <>
      {data.arrivals.length ? <ul>{data.arrivals.map((item, index) => <li key={`${item.route}-${index}`}><strong>{item.route}</strong><span>앞차 {busText(item.first)}</span>{item.second && <span>뒷차 {busText(item.second)}</span>}</li>)}</ul> : <p>현재 제공되는 도착정보가 없습니다. 운행시간 외이거나 정보가 일시적으로 없을 수 있습니다.</p>}
      <small>{new Date(data.updatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Seoul' })} 조회 · 교통 상황에 따라 달라질 수 있습니다.</small>
    </>}
  </section>
}

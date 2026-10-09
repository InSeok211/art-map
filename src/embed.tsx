import { memo, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ARTIST_WORKSHOP_PLACE } from './artistWorkshop'
import { sanitizeAlleys } from './alleys'
import type { Alley } from './alleys'
import { isSiteAdmin, postTrail } from './adminTrailApi'
import { useAutoTrailRecorder } from './useAutoTrailRecorder'
import { GamcheonMap } from './GamcheonMap'
import { isInsideGamcheonMap } from './gamcheonBoundary'
import type { Place } from './types'
import './embed.css'

// 감천 작가 지도 홈페이지(/map)가 iframe으로 끼워 쓰는 지도입니다(public/artist-map-embed).
// 같은 출처(origin)의 부모 창과 postMessage로 주고받습니다.
//   부모 → 지도: { source: 'gamcheon-artist-host', type: 'set', places, selectedId, canPick }
//   지도 → 부모: { source: 'gamcheon-artist-map', type: 'ready' | 'select' | 'pick', ... }
// 주소에 ?mode=full을 붙이면 패널(장소 목록·길찾기)까지 갖춘 전체 지도로 열리고, 작가님 공방을 장소로 함께 보여 줍니다.
const FULL = new URLSearchParams(window.location.search).get('mode') === 'full'
// ?host=site: 홈페이지가 제목 카드(← 감천 작가 지도 · 작가 목록)를 지도 위에 띄우므로, 휴대폰 화면의 지도 쪽
// 이름표를 숨기고 검색·분류를 그 카드 아래에 둡니다(CSS의 is-site-hosted).
const SITE_HOSTED = new URLSearchParams(window.location.search).get('host') === 'site'

interface HostState { places: Place[]; selectedId: string | null; canPick: boolean }

// 부모가 보낸 장소에서 필요한 값만 꺼내 씁니다(알 수 없는 값은 버림).
function toPlace(value: unknown): Place | null {
  const place = value as Partial<Place> | null
  if (!place || typeof place.id !== 'string' || typeof place.name !== 'string') return null
  if (place.category !== 'shop' && place.category !== 'attraction') return null
  const longitude = Number(place.longitude), latitude = Number(place.latitude)
  if (!isInsideGamcheonMap(longitude, latitude)) return null
  return {
    id: place.id, name: place.name, category: place.category, longitude, latitude,
    ...(typeof place.address === 'string' && place.address ? { address: place.address } : {}),
    ...(typeof place.description === 'string' && place.description ? { description: place.description } : {}),
  }
}

const post = (message: Record<string, unknown>) =>
  window.parent.postMessage({ source: 'gamcheon-artist-map', ...message }, window.location.origin)

// 관리자가 확인한 골목길(손으로 그린 길과 GPS 기록으로 찾은 길)을 홈페이지에서 받아 옵니다. 못 받으면 빈 목록.
function useSiteAlleys() {
  const [alleys, setAlleys] = useState<Alley[]>([])
  useEffect(() => {
    let cancelled = false
    fetch('/api/map-alleys')
      .then((response) => response.ok ? response.json() : { alleys: [] })
      .then((body: { alleys?: unknown }) => { if (!cancelled) setAlleys(sanitizeAlleys(body.alleys)) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])
  return alleys
}

// 관리자로 로그인해 공개 지도를 열면, 걸은 길을 자동으로 기록해 골목길 후보 찾기에 씁니다(일반 방문자는 기록하지
// 않음). 기록 중인지 늘 보이도록 지도 위에 작은 표시와 일시정지 버튼을 둡니다.
function useAdminAutoTrail() {
  const [admin, setAdmin] = useState(false)
  useEffect(() => {
    let cancelled = false
    isSiteAdmin().then((value) => { if (!cancelled) setAdmin(value) })
    return () => { cancelled = true }
  }, [])
  return useAutoTrailRecorder(admin, async (trail, { keepalive }) => { await postTrail(trail, keepalive) })
}

function AutoTrailBadge({ recorder }: { recorder: ReturnType<typeof useAutoTrailRecorder> }) {
  if (!recorder.enabled) return null
  return <div className={`embed-auto-trail${recorder.recording ? ' is-recording' : ''}${SITE_HOSTED ? ' is-site-hosted' : ''}`} role="status">
    <span className="embed-auto-trail__dot" aria-hidden="true" />
    <span>{recorder.recording ? `골목길 자동 기록 중 · ${recorder.pointCount}점` : '골목길 자동 기록 꺼짐'}</span>
    <button type="button" onClick={recorder.recording ? recorder.pause : recorder.resume}>{recorder.recording ? '일시정지' : '다시 켜기'}</button>
  </div>
}

function EmbeddedMap() {
  const [host, setHost] = useState<HostState>({ places: [], selectedId: null, canPick: false })
  const alleys = useSiteAlleys()
  const autoTrail = useAdminAutoTrail()
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== window.location.origin) return
      if (event.data?.source !== 'gamcheon-artist-host' || event.data.type !== 'set') return
      setHost({
        places: Array.isArray(event.data.places) ? event.data.places.map(toPlace).filter((place: Place | null): place is Place => place !== null) : [],
        selectedId: typeof event.data.selectedId === 'string' ? event.data.selectedId : null,
        canPick: event.data.canPick === true,
      })
    }
    window.addEventListener('message', receive)
    post({ type: 'ready' })
    return () => window.removeEventListener('message', receive)
  }, [])

  const map = <EmbeddedMapView host={host} alleys={alleys} />
  return <>{map}<AutoTrailBadge recorder={autoTrail} /></>
}

// 자동 기록 표시가 GPS 점마다 바뀌어도 지도는 다시 그리지 않도록 따로 둡니다.
const EmbeddedMapView = memo(function EmbeddedMapView({ host, alleys }: { host: HostState; alleys: Alley[] }) {
  const places = FULL ? [ARTIST_WORKSHOP_PLACE, ...host.places.filter((place) => place.id !== ARTIST_WORKSHOP_PLACE.id)] : host.places
  return <GamcheonMap
    compact={!FULL}
    className={`${FULL ? 'artist-full-map' : 'artist-embed-map'}${SITE_HOSTED ? ' is-site-hosted' : ''}`}
    places={places}
    alleys={alleys}
    selectedPlaceId={host.selectedId}
    onPlaceSelect={(place) => post({ type: 'select', id: place.id })}
    onMapClick={host.canPick ? (longitude, latitude) => post({ type: 'pick', longitude, latitude }) : undefined}
  />
})

createRoot(document.getElementById('root')!).render(<EmbeddedMap />)

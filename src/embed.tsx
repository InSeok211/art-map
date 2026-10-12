import { memo, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ARTIST_WORKSHOP_PLACE } from './places/artistWorkshop'
import { sanitizeAlleys } from './alleys/alleys'
import type { Alley } from './alleys/alleys'
import { useSiteBuildingEdits } from './buildings/siteBuildingEdits'
import type { BuildingEdits } from './buildings/buildingEdits'
import { GamcheonMap } from './GamcheonMap'
import { isInsideGamcheonMap } from './map/gamcheonBoundary'
import type { Place } from './types'
import './embed.css'

// 감천 골목지도 공개 지도(지도 앱 서버의 /)입니다. 감천 작가 지도 홈페이지(/map)가 iframe으로 끼워 쓰고,
// 홈페이지(HOST_ORIGINS)와만 postMessage로 주고받습니다(다른 곳에서 온 메시지는 무시).
//   부모 → 지도: { source: 'gamcheon-artist-host', type: 'set', places, selectedId, canPick }
//   지도 → 부모: { source: 'gamcheon-artist-map', type: 'ready' | 'select' | 'pick', ... }
// 주소에 ?mode=full을 붙이거나 주소를 바로 열면 패널(장소 목록·길찾기)까지 갖춘 전체 지도로 열리고, 작가님 공방을
// 장소로 함께 보여 줍니다.
const EMBEDDED = window.self !== window.top
const FULL = new URLSearchParams(window.location.search).get('mode') === 'full' || !EMBEDDED
// 지도를 끼워 쓰는 홈페이지 주소입니다(public/_headers의 frame-ancestors와 같게 둡니다).
const HOST_ORIGINS = ['https://gamcheon-artist-map-apply.rjbcom4263.workers.dev', 'http://127.0.0.1:8787', 'http://localhost:8787']
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

// 메시지를 보낼 홈페이지 주소. 처음에는 iframe을 연 페이지 주소(referrer)로 정하고, 홈페이지가 보낸 메시지를 받으면
// 그 주소로 맞춥니다. 허락한 주소가 아니면 아무 데도 보내지 않습니다.
let hostOrigin = (() => {
  try {
    const origin = new URL(document.referrer).origin
    return HOST_ORIGINS.includes(origin) ? origin : null
  } catch {
    return null
  }
})()
const post = (message: Record<string, unknown>) => {
  if (EMBEDDED && hostOrigin) window.parent.postMessage({ source: 'gamcheon-artist-map', ...message }, hostOrigin)
}

// 관리자가 확인한 골목길(손으로 그린 길과 GPS 기록으로 찾은 길)을 지도 앱 서버에서 받아 옵니다. 못 받으면 빈 목록.
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

function EmbeddedMap() {
  const [host, setHost] = useState<HostState>({ places: [], selectedId: null, canPick: false })
  const alleys = useSiteAlleys()
  const buildingEdits = useSiteBuildingEdits()
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || !HOST_ORIGINS.includes(event.origin)) return
      hostOrigin = event.origin
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

  return buildingEdits && <EmbeddedMapView host={host} alleys={alleys} buildingEdits={buildingEdits} />
}

const EmbeddedMapView = memo(function EmbeddedMapView({ host, alleys, buildingEdits }: { host: HostState; alleys: Alley[]; buildingEdits: BuildingEdits }) {
  const places = FULL ? [ARTIST_WORKSHOP_PLACE, ...host.places.filter((place) => place.id !== ARTIST_WORKSHOP_PLACE.id)] : host.places
  return <GamcheonMap
    compact={!FULL}
    className={`${FULL ? 'artist-full-map' : 'artist-embed-map'}${SITE_HOSTED ? ' is-site-hosted' : ''}`}
    places={places}
    alleys={alleys}
    buildingEdits={buildingEdits}
    selectedPlaceId={host.selectedId}
    onPlaceSelect={(place) => post({ type: 'select', id: place.id })}
    onMapClick={host.canPick ? (longitude, latitude) => post({ type: 'pick', longitude, latitude }) : undefined}
  />
})

createRoot(document.getElementById('root')!).render(<EmbeddedMap />)

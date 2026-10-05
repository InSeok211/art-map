import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ARTIST_WORKSHOP_PLACE } from './artistWorkshop'
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

function EmbeddedMap() {
  const [host, setHost] = useState<HostState>({ places: [], selectedId: null, canPick: false })
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

  const places = FULL ? [ARTIST_WORKSHOP_PLACE, ...host.places.filter((place) => place.id !== ARTIST_WORKSHOP_PLACE.id)] : host.places
  return <GamcheonMap
    compact={!FULL}
    className={FULL ? 'artist-full-map' : 'artist-embed-map'}
    places={places}
    selectedPlaceId={host.selectedId}
    onPlaceSelect={(place) => post({ type: 'select', id: place.id })}
    onMapClick={host.canPick ? (longitude, latitude) => post({ type: 'pick', longitude, latitude }) : undefined}
  />
}

createRoot(document.getElementById('root')!).render(<EmbeddedMap />)

import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { GamcheonMap } from './GamcheonMap'
import { RETIRED_ASSET_IDS, sanitizeModels } from './modelCatalog'
import type { MapModel } from './modelCatalog'
import { ARTIST_WORKSHOP_MODEL, refineArtistWorkshopPlace, removeUntouchedWorkshopModel, seedArtistWorkshopPlace } from './artistWorkshop'
import { seedBeautifulHangulPlace } from './beautifulHangul'
import { sanitizeAlleys } from './alleys'
import type { Alley } from './alleys'
import type { Place } from './types'
import './demo.css'
import { ARTIST_WORKSHOP_FOOTPRINT_ID, getPhotographedStreetBuildings } from './streetSceneData'

// Survey links open the same map at the building being reviewed.
const reviewId = new URLSearchParams(window.location.search).get('building')
const reviewBearing = Number(new URLSearchParams(window.location.search).get('bearing'))
const reviewPitch = Number(new URLSearchParams(window.location.search).get('pitch'))
const reviewZoom = Number(new URLSearchParams(window.location.search).get('zoom'))
const reviewBuilding = reviewId ? getPhotographedStreetBuildings().find(building => building.id === Number(reviewId)) : undefined
const reviewView = Number(reviewId) === ARTIST_WORKSHOP_FOOTPRINT_ID ? {
  center: [ARTIST_WORKSHOP_MODEL.longitude, ARTIST_WORKSHOP_MODEL.latitude] as [number, number],
  zoom: 21.1, pitch: 62, bearing: 135,
} : reviewBuilding ? {
  center: [0, 1].map(axis => reviewBuilding.outline.reduce((sum, point) => sum + point[axis], 0) / reviewBuilding.outline.length) as [number, number],
  zoom: Number.isFinite(reviewZoom) && reviewZoom >= 15 && reviewZoom <= 22 ? reviewZoom : 20.4,
  pitch: new URLSearchParams(window.location.search).has('pitch') && Number.isFinite(reviewPitch) && reviewPitch >= 0 && reviewPitch <= 80 ? reviewPitch : 56,
  bearing: Number.isFinite(reviewBearing) && new URLSearchParams(window.location.search).has('bearing') ? reviewBearing : 45,
} : undefined

// 컴포넌트 동작을 확인하기 위한 미리보기 데이터입니다. 실제 장소 목록은 추후 연결합니다.
const demoPlaces: Place[] = [
  {
    id: 'gamcheon-culture-village-preview',
    name: '감천문화마을',
    category: 'attraction',
    latitude: 35.0975,
    longitude: 129.0103,
    address: '부산 사하구 감천2동 일대',
    description: '미리보기용 대략 위치입니다. 실제 장소 데이터는 추후 연결합니다.',
  },
]

const STORAGE_KEY = 'gamcheon-map-places-v1'
const MODELS_STORAGE_KEY = 'gamcheon-map-models-v1'
const WORKSHOP_PLACE_SEEDED_KEY = 'gamcheon-map-workshop-place-180-seeded-v1'
const BEAUTIFUL_HANGUL_PLACE_SEEDED_KEY = 'gamcheon-map-beautiful-hangul-place-32-seeded-v1'
const ALLEYS_STORAGE_KEY = 'gamcheon-map-alleys-v1'

function loadAlleys(): Alley[] {
  try {
    const stored = localStorage.getItem(ALLEYS_STORAGE_KEY)
    return stored === null ? [] : sanitizeAlleys(JSON.parse(stored))
  } catch {
    return []
  }
}

// Older previews placed sample houses and decorations on unrelated parcels.
// Remove only those known sample IDs; user-placed models remain untouched.
const DEMO_MODEL_IDS = new Set([
  'demo-house-1', 'demo-house-2', 'demo-shop', 'demo-cafe',
  'demo-tree-1', 'demo-tree-2', 'demo-tree-3', 'demo-flower',
])
const demoModels: MapModel[] = []

function loadModels(): MapModel[] {
  try {
    const stored = localStorage.getItem(MODELS_STORAGE_KEY)
    const savedModels = stored === null ? demoModels : sanitizeModels(JSON.parse(stored))
    const models = savedModels.filter((model) =>
      !DEMO_MODEL_IDS.has(model.id) && !RETIRED_ASSET_IDS.has(model.assetId))
    const next = removeUntouchedWorkshopModel(models)
    if (next !== models || models.length !== savedModels.length) {
      localStorage.setItem(MODELS_STORAGE_KEY, JSON.stringify(next))
    }
    return next
  } catch {
    return demoModels
  }
}

function loadPlaces(): Place[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    const value: unknown = stored === null ? demoPlaces : JSON.parse(stored)
    const valid = Array.isArray(value) && value.every((item: unknown) => {
      if (typeof item !== 'object' || item === null) return false
      const place = item as Record<string, unknown>
      return typeof place.id === 'string' && typeof place.name === 'string'
        && (place.category === 'shop' || place.category === 'attraction')
        && typeof place.latitude === 'number' && Number.isFinite(place.latitude)
        && typeof place.longitude === 'number' && Number.isFinite(place.longitude)
    })
    const places = valid ? value as Place[] : demoPlaces
    const seeded = stored !== null && localStorage.getItem(WORKSHOP_PLACE_SEEDED_KEY) === '1'
    const hangulSeeded = stored !== null && localStorage.getItem(BEAUTIFUL_HANGUL_PLACE_SEEDED_KEY) === '1'
    const next = seedBeautifulHangulPlace(refineArtistWorkshopPlace(seedArtistWorkshopPlace(places, seeded)), hangulSeeded)
    if (!seeded || !hangulSeeded || next !== places) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      localStorage.setItem(WORKSHOP_PLACE_SEEDED_KEY, '1')
      localStorage.setItem(BEAUTIFUL_HANGUL_PLACE_SEEDED_KEY, '1')
    }
    return next
  } catch {
    return seedBeautifulHangulPlace(seedArtistWorkshopPlace(demoPlaces, false), false)
  }
}

function Demo() {
  const [phoneLayout, setPhoneLayout] = useState(() => window.matchMedia('(max-width: 720px)').matches)
  const [mobileEditing, setMobileEditing] = useState(false)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [places, setPlaces] = useState<Place[]>(loadPlaces)
  const [models, setModels] = useState<MapModel[]>(loadModels)
  const [alleys, setAlleys] = useState<Alley[]>(loadAlleys)

  useEffect(() => {
    const query = window.matchMedia('(max-width: 720px)')
    const update = () => setPhoneLayout(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  function updateAlleys(next: Alley[]) {
    setAlleys(next)
    try { localStorage.setItem(ALLEYS_STORAGE_KEY, JSON.stringify(next)) } catch { /* Browser storage can be unavailable. */ }
  }

  function updatePlaces(next: Place[]) {
    setPlaces(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* Browser storage can be unavailable. */ }
  }

  function updateModels(next: MapModel[]) {
    setModels(next)
    try { localStorage.setItem(MODELS_STORAGE_KEY, JSON.stringify(next)) } catch { /* Browser storage can be unavailable. */ }
  }

  return (
    <div className="demo-shell">
      <header className="demo-header">
        <div className="demo-brand">
          <span className="demo-brand-icon">G</span>
          <span className="demo-brand-desktop"><strong>감천 골목지도</strong><small>MAP COMPONENT PREVIEW</small></span>
          <span className="demo-brand-mobile"><strong>감천 작가 지도</strong><small>공방과 가게를 한 지도에서</small></span>
        </div>
        <div className="demo-status"><span /> {selectedName ? `${selectedName} 선택됨` : '리액트 지도 컴포넌트 미리보기'}</div>
        {phoneLayout && <button className="demo-edit-toggle" type="button" onClick={() => setMobileEditing((editing) => !editing)}>{mobileEditing ? '지도 보기' : '편집'}</button>}
      </header>
      <main className="demo-main">
        <GamcheonMap initialView={reviewView} places={places} models={models} editable={!phoneLayout || mobileEditing} className={phoneLayout && !mobileEditing ? 'is-site-hosted' : ''} onPlacesChange={updatePlaces} onModelsChange={updateModels} alleys={alleys} onAlleysChange={updateAlleys} onPlaceSelect={(place) => setSelectedName(place.name)} />
      </main>
      <div className="demo-note">장소·3D 배치·골목길은 이 브라우저에 자동 저장됩니다. 영상·로드뷰에서 확인한 건물 외관을 반영하고, 주변 지붕은 항공사진과 건물 윤곽을 대조해 색을 입혔습니다. 확인되지 않은 외벽과 판독이 어려운 지붕은 중립색 임시 모델입니다.</div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Demo />)

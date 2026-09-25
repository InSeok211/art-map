import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { GamcheonMap } from './GamcheonMap'
import { sanitizeModels } from './modelCatalog'
import type { MapModel } from './modelCatalog'
import { sanitizeAlleys } from './alleys'
import type { Alley } from './alleys'
import type { Place } from './types'
import './demo.css'

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
const ALLEYS_STORAGE_KEY = 'gamcheon-map-alleys-v1'

function loadAlleys(): Alley[] {
  try {
    const stored = localStorage.getItem(ALLEYS_STORAGE_KEY)
    return stored === null ? [] : sanitizeAlleys(JSON.parse(stored))
  } catch {
    return []
  }
}

// 배치 흐름을 보여 주는 시연용 모델입니다. 실제 건물 위치를 뜻하지 않습니다.
const demoModels: MapModel[] = [
  { id: 'demo-house-1', assetId: 'rounded-house', longitude: 129.0096, latitude: 35.0966, widthMeters: 22, rotation: 22, altitudeMeters: 0 },
  { id: 'demo-house-2', assetId: 'angular-house', longitude: 129.0103, latitude: 35.0963, widthMeters: 20, rotation: 342, altitudeMeters: 0 },
  { id: 'demo-shop', assetId: 'rounded-shop', longitude: 129.0108, latitude: 35.0968, widthMeters: 22, rotation: 15, altitudeMeters: 0 },
  { id: 'demo-cafe', assetId: 'rounded-cafe', longitude: 129.0115, latitude: 35.0972, widthMeters: 20, rotation: 340, altitudeMeters: 0 },
  { id: 'demo-tree-1', assetId: 'rounded-pine', longitude: 129.0086, latitude: 35.0972, widthMeters: 10, rotation: 0, altitudeMeters: 0 },
  { id: 'demo-tree-2', assetId: 'angular-pine', longitude: 129.0089, latitude: 35.0974, widthMeters: 10, rotation: 40, altitudeMeters: 0 },
  { id: 'demo-tree-3', assetId: 'rounded-fruit', longitude: 129.0119, latitude: 35.0977, widthMeters: 9, rotation: 0, altitudeMeters: 0 },
  { id: 'demo-flower', assetId: 'rounded-flower', longitude: 129.0109, latitude: 35.0974, widthMeters: 7, rotation: 0, altitudeMeters: 0 },
]

function loadModels(): MapModel[] {
  try {
    const stored = localStorage.getItem(MODELS_STORAGE_KEY)
    return stored === null ? demoModels : sanitizeModels(JSON.parse(stored))
  } catch {
    return demoModels
  }
}

function loadPlaces(): Place[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === null) return demoPlaces
    const value: unknown = JSON.parse(stored)
    if (!Array.isArray(value) || !value.every((item: unknown) => {
      if (typeof item !== 'object' || item === null) return false
      const place = item as Record<string, unknown>
      return typeof place.id === 'string' && typeof place.name === 'string'
        && (place.category === 'shop' || place.category === 'attraction')
        && typeof place.latitude === 'number' && Number.isFinite(place.latitude)
        && typeof place.longitude === 'number' && Number.isFinite(place.longitude)
    })) return demoPlaces
    return value as Place[]
  } catch {
    return demoPlaces
  }
}

function Demo() {
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [places, setPlaces] = useState<Place[]>(loadPlaces)
  const [models, setModels] = useState<MapModel[]>(loadModels)
  const [alleys, setAlleys] = useState<Alley[]>(loadAlleys)

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
          <span><strong>감천 골목지도</strong><small>MAP COMPONENT PREVIEW</small></span>
        </div>
        <div className="demo-status"><span /> {selectedName ? `${selectedName} 선택됨` : '리액트 지도 컴포넌트 미리보기'}</div>
      </header>
      <main className="demo-main">
        <GamcheonMap places={places} models={models} editable onPlacesChange={updatePlaces} onModelsChange={updateModels} alleys={alleys} onAlleysChange={updateAlleys}onPlaceSelect={(place) => setSelectedName(place.name)} />
      </main>
      <div className="demo-note">장소·3D 배치·골목길은 이 브라우저에 자동 저장됩니다. 초기 배치는 실제 건물 위치가 아닌 시연용입니다. 3D 에셋: dogfooter.</div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Demo />)

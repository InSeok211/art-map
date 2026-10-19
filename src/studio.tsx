import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { GamcheonMap } from './GamcheonMap'
import type { EditTool } from './GamcheonMap'
import { ARTIST_WORKSHOP_PLACE } from './places/artistWorkshop'
import { useAlleyStore } from './alleys/alleyStore'
import { useBuildingEditStore } from './buildings/buildingEditStore'
import './studio.css'
import { ARTIST_WORKSHOP_FOOTPRINT_ID, getPhotographedStreetBuildings } from './scene/streetSceneData'
import { useMapPlaces } from './places/mapPlaceStore'

// 감천 골목지도 편집 앱입니다. 홈페이지 운영자 화면의 '지도 편집'(/admin/map-editor)이 /map-app/studio/를 띄우고,
// 골목길과 건물을 고쳐 공개 지도(홈페이지 /map)에 반영합니다.
//  - 홈페이지에서 열면 홈페이지 운영자 로그인으로 확인하고 홈페이지 데이터베이스에 저장합니다.
//  - 개발 미리보기(npm run dev)에서는 서버가 없으므로 로그인 없이 이 브라우저에만 저장합니다.
const PREVIEW = import.meta.env.DEV
// 건물 편집 저장소는 이 표시가 있으면 서버 저장소만 씁니다(서버를 못 읽을 때 몰래 브라우저에 저장하지 않게).
if (!PREVIEW) document.documentElement.dataset.buildingEditServer = 'true'

// Survey links open the same map at the building being reviewed.
const query = new URLSearchParams(window.location.search)
const reviewId = query.get('building')
const reviewBearing = Number(query.get('bearing'))
const reviewPitch = Number(query.get('pitch'))
const reviewZoom = Number(query.get('zoom'))
const reviewBuilding = reviewId ? getPhotographedStreetBuildings().find(building => building.id === Number(reviewId)) : undefined
const reviewView = Number(reviewId) === ARTIST_WORKSHOP_FOOTPRINT_ID ? {
  center: [ARTIST_WORKSHOP_PLACE.longitude, ARTIST_WORKSHOP_PLACE.latitude] as [number, number],
  zoom: 21.1, pitch: 62, bearing: 135,
} : reviewBuilding ? {
  center: [0, 1].map(axis => reviewBuilding.outline.reduce((sum, point) => sum + point[axis], 0) / reviewBuilding.outline.length) as [number, number],
  zoom: Number.isFinite(reviewZoom) && reviewZoom >= 15 && reviewZoom <= 22 ? reviewZoom : 20.4,
  pitch: query.has('pitch') && Number.isFinite(reviewPitch) && reviewPitch >= 0 && reviewPitch <= 80 ? reviewPitch : 56,
  bearing: Number.isFinite(reviewBearing) && query.has('bearing') ? reviewBearing : 45,
} : undefined

// 장소 메뉴는 공개 지도의 편의시설을 관리합니다. 공방은 기존 건물 메뉴에서 관리합니다.
const EDIT_TOOLS: EditTool[] = ['places', 'alleys', 'buildings']

function Studio() {
  const [phoneLayout, setPhoneLayout] = useState(() => window.matchMedia('(max-width: 720px)').matches)
  const [mobileEditing, setMobileEditing] = useState(true)
  const alleyStore = useAlleyStore()
  const buildingStore = useBuildingEditStore()
  const placeStore = useMapPlaces(true)
  const places = placeStore.places

  useEffect(() => {
    const media = window.matchMedia('(max-width: 720px)')
    const update = () => setPhoneLayout(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const editing = !phoneLayout || mobileEditing
  const saveState = PREVIEW ? '이 브라우저에만 저장(미리보기)' : '홈페이지 서버에 저장'
  if (!alleyStore.ready || !placeStore.ready) return <main className="studio-login">
    <p role="status">{alleyStore.notice || placeStore.notice || '지도 서버 데이터를 불러오는 중…'}</p>
    {(alleyStore.notice || placeStore.notice) && <button type="button" onClick={() => window.location.reload()}>새로고침</button>}
  </main>
  return (
    <div className="demo-shell">
      <header className="demo-header">
        <div className="demo-brand">
          <span className="demo-brand-icon">G</span>
          <span><strong>골목지도 편집 앱</strong><small>{saveState}</small></span>
        </div>
        <div className="studio-header-actions">
          <button className="studio-place-publish" type="button" disabled={!placeStore.dirty || placeStore.saving} onClick={() => void placeStore.publish()}>{placeStore.saving ? '저장 중…' : '장소 공개하기'}</button>
          {phoneLayout && <button className="demo-edit-toggle" type="button" onClick={() => setMobileEditing((current) => !current)}>{editing ? '지도만 보기' : '편집하기'}</button>}
          <a className="studio-link" href={PREVIEW ? '../' : '/map'} target="_blank" rel="noreferrer">공개 지도 보기</a>
        </div>
      </header>
      <main className="demo-main">
        <GamcheonMap initialView={reviewView} places={places} onPlacesChange={placeStore.update} editable={editing && !placeStore.saving} editTools={EDIT_TOOLS} className={editing ? '' : 'is-site-hosted'} alleys={alleyStore.alleys} onAlleysChange={alleyStore.updateAlleys} gpsTrails={alleyStore.gpsTrails} buildingEditor={buildingStore} />
      </main>
      {alleyStore.notice && <div className="demo-note is-alert" role="status">{alleyStore.notice}</div>}
      {placeStore.notice && <div className="studio-place-status" role="status">{placeStore.notice}</div>}
    </div>
  )
}

// 홈페이지 운영자로 로그인했는지 먼저 확인합니다(같은 홈페이지 서버의 /api/admin/session).
function StudioGate() {
  const [state, setState] = useState<'checking' | 'denied' | 'error' | 'ready'>(PREVIEW ? 'ready' : 'checking')
  useEffect(() => {
    if (PREVIEW) return
    fetch('/api/admin/session', { cache: 'no-store' })
      .then((response) => response.json() as Promise<{ admin?: boolean }>)
      .then((session) => setState(session.admin ? 'ready' : 'denied'))
      .catch(() => setState('error'))
  }, [])
  if (state === 'checking') return <main className="studio-login"><p>확인하는 중…</p></main>
  if (state !== 'ready') return <main className="studio-login">
    <div className="studio-login__box">
      <span className="demo-brand-icon">G</span>
      <h1>골목지도 편집 앱</h1>
      <p>{state === 'denied' ? '홈페이지 운영자로 로그인해야 쓸 수 있습니다.' : '서버에 연결하지 못했습니다. 잠시 뒤 다시 열어 주세요.'}</p>
      <a href="/admin/login" target="_top">운영자 로그인</a>
    </div>
  </main>
  return <Studio />
}

createRoot(document.getElementById('root')!).render(<StudioGate />)

import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { GamcheonMap } from './GamcheonMap'
import type { EditTool } from './GamcheonMap'
import { ARTIST_WORKSHOP_MODEL, ARTIST_WORKSHOP_PLACE } from './artistWorkshop'
import { BEAUTIFUL_HANGUL_PLACE } from './beautifulHangul'
import { useAlleyStore } from './alleyStore'
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

// 골목지도 작업실(홈페이지 /admin/art-map, 개발 미리보기는 npm run dev)입니다.
// 공개 지도에 반영되는 골목길 편집만 둡니다. 장소는 공개 지도와 같은 기본 장소만 보여 줍니다(작가 위치는
// 홈페이지의 '작가 위치·공개'에서 관리). 예전의 브라우저 전용 장소·3D 배치 편집은 공개 지도와 연결되지 않아 뺐습니다.
const PLACES: Place[] = [ARTIST_WORKSHOP_PLACE, BEAUTIFUL_HANGUL_PLACE]
const EDIT_TOOLS: EditTool[] = ['alleys']
// 홈페이지 안(iframe)에서 열리면 홈페이지가 제목과 메뉴를 보여 주므로, 이 화면의 머리글은 휴대폰의 편집 전환만 남깁니다.
const EMBEDDED = window.self !== window.top

function Demo() {
  const [phoneLayout, setPhoneLayout] = useState(() => window.matchMedia('(max-width: 720px)').matches)
  const [mobileEditing, setMobileEditing] = useState(true)
  const alleyStore = useAlleyStore()

  useEffect(() => {
    const query = window.matchMedia('(max-width: 720px)')
    const update = () => setPhoneLayout(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  const editing = !phoneLayout || mobileEditing
  const saveState = alleyStore.server ? '홈페이지에 저장됨' : '이 브라우저에만 저장(미리보기)'
  return (
    <div className={`demo-shell${EMBEDDED ? ' is-embedded' : ''}`}>
      {(!EMBEDDED || phoneLayout) && <header className="demo-header">
        <div className="demo-brand">
          <span className="demo-brand-icon">G</span>
          <span><strong>골목지도 작업실</strong><small>{saveState}</small></span>
        </div>
        {phoneLayout && <button className="demo-edit-toggle" type="button" onClick={() => setMobileEditing((current) => !current)}>{editing ? '지도만 보기' : '골목길 편집'}</button>}
      </header>}
      <main className="demo-main">
        <GamcheonMap initialView={reviewView} places={PLACES} editable={editing} editTools={EDIT_TOOLS} className={editing ? '' : 'is-site-hosted'} alleys={alleyStore.alleys} onAlleysChange={alleyStore.updateAlleys} gpsTrails={alleyStore.gpsTrails} />
      </main>
      {alleyStore.notice && <div className="demo-note is-alert" role="status">{alleyStore.notice}</div>}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Demo />)

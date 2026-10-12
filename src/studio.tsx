import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { GamcheonMap } from './GamcheonMap'
import type { EditTool } from './GamcheonMap'
import { ARTIST_WORKSHOP_PLACE } from './places/artistWorkshop'
import { BEAUTIFUL_HANGUL_PLACE } from './scene/beautifulHangul'
import { useAlleyStore } from './alleys/alleyStore'
import { useBuildingEditStore } from './buildings/buildingEditStore'
import type { Place } from './types'
import './studio.css'
import { ARTIST_WORKSHOP_FOOTPRINT_ID, getPhotographedStreetBuildings } from './scene/streetSceneData'

// 감천 골목지도 편집 앱(지도 앱 서버의 /studio/)입니다. 골목길과 건물을 고쳐 공개 지도(/)에 반영합니다.
//  - 지도 앱 서버에서 열면 관리자로 로그인한 뒤 서버 데이터베이스에 저장합니다.
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

// 장소는 공개 지도와 같은 기본 장소만 보여 줍니다(작가 위치는 홈페이지가 공개 지도에 넘겨 줌).
const PLACES: Place[] = [ARTIST_WORKSHOP_PLACE, BEAUTIFUL_HANGUL_PLACE]
const EDIT_TOOLS: EditTool[] = ['alleys', 'buildings']

async function postJson(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const result = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(result.error || `오류 ${response.status}`)
  return result
}

function Studio({ open }: { open: boolean }) {
  const [phoneLayout, setPhoneLayout] = useState(() => window.matchMedia('(max-width: 720px)').matches)
  const [mobileEditing, setMobileEditing] = useState(true)
  const alleyStore = useAlleyStore()
  const buildingStore = useBuildingEditStore()

  useEffect(() => {
    const media = window.matchMedia('(max-width: 720px)')
    const update = () => setPhoneLayout(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const editing = !phoneLayout || mobileEditing
  const saveState = PREVIEW ? '이 브라우저에만 저장(미리보기)' : '지도 앱 서버에 저장'
  const logout = () => { void postJson('/api/admin/logout').finally(() => window.location.reload()) }
  if (!alleyStore.ready) return <main className="studio-login">
    <p role="status">{alleyStore.notice || '골목길 서버 데이터를 불러오는 중…'}</p>
    {alleyStore.notice && <button type="button" onClick={() => window.location.reload()}>새로고침</button>}
  </main>
  return (
    <div className="demo-shell">
      <header className="demo-header">
        <div className="demo-brand">
          <span className="demo-brand-icon">G</span>
          <span><strong>골목지도 편집 앱</strong><small>{saveState}</small></span>
        </div>
        <div className="studio-header-actions">
          {phoneLayout && <button className="demo-edit-toggle" type="button" onClick={() => setMobileEditing((current) => !current)}>{editing ? '지도만 보기' : '편집하기'}</button>}
          <a className="studio-link" href="/?view=public" target="_blank" rel="noreferrer">공개 지도 보기</a>
          {!PREVIEW && !open && <button className="studio-link" type="button" onClick={logout}>로그아웃</button>}
        </div>
      </header>
      <main className="demo-main">
        <GamcheonMap initialView={reviewView} places={PLACES} editable={editing} editTools={EDIT_TOOLS} className={editing ? '' : 'is-site-hosted'} alleys={alleyStore.alleys} onAlleysChange={alleyStore.updateAlleys} gpsTrails={alleyStore.gpsTrails} buildingEditor={buildingStore} />
      </main>
      {alleyStore.notice && <div className="demo-note is-alert" role="status">{alleyStore.notice}</div>}
    </div>
  )
}

function Login({ notice, onLogin }: { notice: string; onLogin: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await postJson('/api/admin/login', { username, password })
      onLogin()
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return <main className="studio-login">
    <form onSubmit={submit}>
      <span className="demo-brand-icon">G</span>
      <h1>골목지도 편집 앱</h1>
      <p>관리자만 쓸 수 있습니다.</p>
      {notice && <p className="studio-login__error" role="alert">{notice}</p>}
      <label>아이디<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
      <label>비밀번호<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      {error && <p className="studio-login__error" role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? '확인하는 중…' : '로그인'}</button>
    </form>
  </main>
}

// 서버에서 열면 관리자로 로그인했는지 먼저 확인합니다(서버가 로그인 없이 편집하는 설정이면 바로 엽니다).
function StudioGate() {
  const [state, setState] = useState<'checking' | 'login' | 'ready'>(PREVIEW ? 'ready' : 'checking')
  const [notice, setNotice] = useState('')
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (PREVIEW) return
    fetch('/api/admin/session', { cache: 'no-store' })
      .then((response) => response.json() as Promise<{ admin?: boolean; configured?: boolean; open?: boolean }>)
      .then((session) => {
        setOpen(session.open === true)
        if (session.open) { setState('ready'); return }
        if (session.configured === false) setNotice('관리자 비밀번호가 아직 설정되지 않았습니다(npm run admin:password).')
        setState(session.admin ? 'ready' : 'login')
      })
      .catch(() => { setNotice('지도 앱 서버에 연결하지 못했습니다.'); setState('login') })
  }, [])
  if (state === 'checking') return <main className="studio-login"><p>확인하는 중…</p></main>
  if (state === 'login') return <Login notice={notice} onLogin={() => setState('ready')} />
  return <Studio open={open} />
}

createRoot(document.getElementById('root')!).render(<StudioGate />)

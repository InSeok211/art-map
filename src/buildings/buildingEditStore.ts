import { useEffect, useRef, useState } from 'react'
import { EMPTY_BUILDING_EDITS, sameBuildingEdits, sanitizeBuildingEdits } from './buildingEdits'
import type { BuildingEdits } from './buildingEdits'
import { EditHistory } from './editHistory'

// 골목지도 작업실 '건물' 탭의 저장소입니다. 초안(작업실에서만 보임)과 공개본(공개 지도) 두 벌을 다룹니다.
//  - 편집 앱(지도 앱 서버의 /studio/)에서 열리면 서버 데이터베이스에 저장합니다(관리자만).
//  - 그 밖(개발 미리보기)에서는 이 브라우저에만 저장합니다.
const API = '/api/admin/map-buildings'
export const DRAFT_KEY = 'gamcheon-building-draft-v1'
export const PUBLISHED_KEY = 'gamcheon-building-published-v1'

export interface BuildingEditStore {
  draft: BuildingEdits
  published: BuildingEdits
  // 공개하지 않은 변경이 있는지
  dirty: boolean
  status: string
  busy: boolean
  // 서버 저장소를 쓰는지(개발 미리보기는 false, 아직 확인 중이거나 못 읽었으면 null)
  server: boolean | null
  onChange: (draft: BuildingEdits) => void
  onPublish: () => void
  onDiscard: () => void
  canUndo?: boolean
  canRedo?: boolean
  onUndo?: () => void
  onRedo?: () => void
  onRestore?: (draft: BuildingEdits, published: BuildingEdits) => void
  retainedModelIds?: ReadonlySet<string>
}

function readLocal(key: string) {
  try {
    const stored = localStorage.getItem(key)
    return stored === null ? EMPTY_BUILDING_EDITS : sanitizeBuildingEdits(JSON.parse(stored))
  } catch {
    return EMPTY_BUILDING_EDITS
  }
}
function writeLocal(key: string, value: BuildingEdits) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true } catch { return false }
}

async function call(path: string, init?: RequestInit) {
  const response = await fetch(path, { cache: 'no-store', ...init, headers: { 'content-type': 'application/json', ...init?.headers } })
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
    const body = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error || String(response.status))
  }
  return response.json() as Promise<Record<string, unknown>>
}

export function useBuildingEditStore(): BuildingEditStore {
  const hosted = document.documentElement.dataset.buildingEditServer === 'true'
  const [draft, setDraft] = useState<BuildingEdits>(() => readLocal(DRAFT_KEY))
  const [published, setPublished] = useState<BuildingEdits>(() => readLocal(PUBLISHED_KEY))
  const [mode, setMode] = useState<'loading' | 'server' | 'local' | 'error'>(hosted ? 'loading' : 'local')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const saveTimer = useRef(0)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const latestDraft = useRef(draft)
  latestDraft.current = draft
  const history = useRef(new EditHistory(draft))
  const [, refreshHistory] = useState(0)

  // 관리자 화면에서는 API 오류를 로컬 미리보기로 취급하지 않습니다.
  useEffect(() => {
    if (!hosted) return
    let cancelled = false
    call(API).then((saved) => {
      if (cancelled) return
      const next = sanitizeBuildingEdits(saved.draft)
      latestDraft.current = next
      history.current.reset(next)
      setMode('server')
      setDraft(next)
      setPublished(sanitizeBuildingEdits(saved.published))
    }).catch((error: Error) => {
      if (cancelled) return
      setMode('error')
      setStatus(`건물 편집 내용을 불러오지 못했습니다: ${error.message}. 페이지를 새로고침해 주세요.`)
    })
    return () => { cancelled = true }
  }, [hosted])

  function queueSave(next: BuildingEdits) {
    const pending = saveQueue.current.then(async () => {
      await call(API, { method: 'PUT', body: JSON.stringify({ draft: next }) })
    })
    // 실패한 자동 저장이 뒤따르는 저장·버리기를 막지 않도록 큐만 정상 상태로 되돌립니다.
    saveQueue.current = pending.catch(() => undefined)
    return pending
  }

  function saveDraftSoon(next: BuildingEdits) {
    if (mode === 'local') {
      setStatus(writeLocal(DRAFT_KEY, next) ? '이 브라우저에 초안을 저장했습니다.' : '저장 공간이 부족합니다. 백업을 내려받아 주세요.')
      return
    }
    // 조절바를 끄는 동안 여러 번 바뀌므로 잠시 모았다가 저장합니다.
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      queueSave(latestDraft.current)
        .then(() => setStatus(''))
        .catch((error: Error) => setStatus(`초안을 저장하지 못했습니다: ${error.message}`))
    }, 700)
  }

  function changeDraft(next: BuildingEdits, record = true) {
    const clean = sanitizeBuildingEdits(next)
    if (record) history.current.change(clean)
    setDraft(clean)
    latestDraft.current = clean
    refreshHistory((value) => value + 1)
    saveDraftSoon(clean)
  }

  async function run(action: () => Promise<void>, done: string) {
    if (busyRef.current || mode === 'loading' || mode === 'error') return
    busyRef.current = true
    setBusy(true)
    try {
      await action()
      setStatus(done)
    } catch (error) {
      setStatus(`${(error as Error).message || '실패했습니다.'} 잠시 뒤 다시 시도해 주세요.`)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return {
    draft,
    published,
    dirty: !sameBuildingEdits(draft, published),
    status,
    busy: busy || mode === 'loading' || mode === 'error',
    server: mode === 'server' ? true : mode === 'local' ? false : null,
    onChange: (next) => { if (!busyRef.current && mode !== 'loading' && mode !== 'error') changeDraft(next) },
    canUndo: history.current.canUndo,
    canRedo: history.current.canRedo,
    retainedModelIds: history.current.modelIds,
    onUndo: () => { if (busyRef.current || mode === 'loading' || mode === 'error') return; const next = history.current.undo(); if (next) changeDraft(next, false) },
    onRedo: () => { if (busyRef.current || mode === 'loading' || mode === 'error') return; const next = history.current.redo(); if (next) changeDraft(next, false) },
    onRestore: (next, publicEdits) => {
      if (mode !== 'local' || busyRef.current) throw new Error('로컬 저장소를 사용할 수 없습니다.')
      const clean = sanitizeBuildingEdits(publicEdits), restored = sanitizeBuildingEdits(next)
      const previousDraft = localStorage.getItem(DRAFT_KEY), previousPublished = localStorage.getItem(PUBLISHED_KEY)
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(restored))
        localStorage.setItem(PUBLISHED_KEY, JSON.stringify(clean))
      } catch {
        try {
          if (previousDraft === null) localStorage.removeItem(DRAFT_KEY); else localStorage.setItem(DRAFT_KEY, previousDraft)
          if (previousPublished === null) localStorage.removeItem(PUBLISHED_KEY); else localStorage.setItem(PUBLISHED_KEY, previousPublished)
        } catch { /* 원래 저장 상태 복원을 시도한 뒤 오류를 알립니다. */ }
        throw new Error('프로젝트 복원에 필요한 저장 공간이 부족합니다.')
      }
      changeDraft(restored); setPublished(clean)
    },
    onPublish: () => void run(async () => {
      if (mode === 'server') {
        // 남아 있는 초안 저장을 먼저 끝내고 공개합니다.
        window.clearTimeout(saveTimer.current)
        await saveQueue.current
        await queueSave(latestDraft.current)
        const result = await call(`${API}/publish`, { method: 'POST' })
        setPublished(sanitizeBuildingEdits(result.published))
      } else {
        if (!writeLocal(PUBLISHED_KEY, latestDraft.current)) throw new Error('공개본을 저장할 공간이 부족합니다.')
        setPublished(latestDraft.current)
      }
    }, mode === 'server' ? '공개 지도에 반영했습니다.' : '이 브라우저의 미리보기에 저장했습니다.'),
    onDiscard: () => void run(async () => {
      if (mode === 'server') {
        window.clearTimeout(saveTimer.current)
        await saveQueue.current
        const result = await call(`${API}/discard`, { method: 'POST' })
        const restored = sanitizeBuildingEdits(result.draft)
        history.current.change(restored)
        latestDraft.current = restored
        setDraft(restored)
      } else {
        if (!writeLocal(DRAFT_KEY, published)) throw new Error('초안을 복원할 저장 공간이 부족합니다.')
        changeDraft(published)
      }
    }, '초안을 버리고 공개된 상태로 되돌렸습니다.'),
  }
}

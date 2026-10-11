import { useEffect, useRef, useState } from 'react'
import { EMPTY_BUILDING_EDITS, sameBuildingEdits, sanitizeBuildingEdits } from './buildingEdits'
import type { BuildingEdits } from './buildingEdits'

// 골목지도 작업실 '건물' 탭의 저장소입니다. 초안(작업실에서만 보임)과 공개본(공개 지도) 두 벌을 다룹니다.
//  - 홈페이지(/admin/art-map) 안에서 열리면 홈페이지 데이터베이스에 저장합니다(관리자만).
//  - 그 밖(개발 미리보기)에서는 이 브라우저에만 저장합니다.
const API = '/api/admin/map-buildings'
const DRAFT_KEY = 'gamcheon-building-draft-v1'
const PUBLISHED_KEY = 'gamcheon-building-published-v1'

export interface BuildingEditStore {
  draft: BuildingEdits
  published: BuildingEdits
  // 공개하지 않은 변경이 있는지
  dirty: boolean
  status: string
  busy: boolean
  onChange: (draft: BuildingEdits) => void
  onPublish: () => void
  onDiscard: () => void
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
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* 이번 화면에서만 유지됩니다. */ }
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

  // 관리자 화면에서는 API 오류를 로컬 미리보기로 취급하지 않습니다.
  useEffect(() => {
    if (!hosted) return
    let cancelled = false
    call(API).then((saved) => {
      if (cancelled) return
      const next = sanitizeBuildingEdits(saved.draft)
      latestDraft.current = next
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
    if (mode === 'local') return writeLocal(DRAFT_KEY, next)
    // 조절바를 끄는 동안 여러 번 바뀌므로 잠시 모았다가 저장합니다.
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      queueSave(latestDraft.current)
        .then(() => setStatus(''))
        .catch((error: Error) => setStatus(`초안을 저장하지 못했습니다: ${error.message}`))
    }, 700)
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
    onChange: (next) => {
      if (busyRef.current || mode === 'loading' || mode === 'error') return
      setDraft(next)
      latestDraft.current = next
      saveDraftSoon(next)
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
        writeLocal(PUBLISHED_KEY, latestDraft.current)
        setPublished(latestDraft.current)
      }
    }, mode === 'server' ? '공개 지도에 반영했습니다.' : '이 브라우저의 미리보기에 저장했습니다.'),
    onDiscard: () => void run(async () => {
      if (mode === 'server') {
        window.clearTimeout(saveTimer.current)
        await saveQueue.current
        const result = await call(`${API}/discard`, { method: 'POST' })
        const restored = sanitizeBuildingEdits(result.draft)
        latestDraft.current = restored
        setDraft(restored)
      } else {
        writeLocal(DRAFT_KEY, published)
        latestDraft.current = published
        setDraft(published)
      }
    }, '초안을 버리고 공개된 상태로 되돌렸습니다.'),
  }
}

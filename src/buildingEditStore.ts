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
  const [draft, setDraft] = useState<BuildingEdits>(() => readLocal(DRAFT_KEY))
  const [published, setPublished] = useState<BuildingEdits>(() => readLocal(PUBLISHED_KEY))
  const [server, setServer] = useState(false)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const saveTimer = useRef(0)
  const latestDraft = useRef(draft)
  latestDraft.current = draft

  // 홈페이지 안에서 열렸는지 확인하고, 그렇다면 저장된 초안·공개본을 불러옵니다.
  useEffect(() => {
    let cancelled = false
    call(API).then((saved) => {
      if (cancelled) return
      setServer(true)
      setDraft(sanitizeBuildingEdits(saved.draft))
      setPublished(sanitizeBuildingEdits(saved.published))
    }).catch(() => { /* 개발 미리보기: 이 브라우저에만 저장합니다. */ })
    return () => { cancelled = true }
  }, [])

  function saveDraftSoon(next: BuildingEdits) {
    if (!server) return writeLocal(DRAFT_KEY, next)
    // 조절바를 끄는 동안 여러 번 바뀌므로 잠시 모았다가 저장합니다.
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      call(API, { method: 'PUT', body: JSON.stringify({ draft: latestDraft.current }) })
        .then(() => setStatus(''))
        .catch((error: Error) => setStatus(`초안을 저장하지 못했습니다: ${error.message}`))
    }, 700)
  }

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true)
    try {
      await action()
      setStatus(done)
    } catch (error) {
      setStatus(`${(error as Error).message || '실패했습니다.'} 잠시 뒤 다시 시도해 주세요.`)
    } finally {
      setBusy(false)
    }
  }

  return {
    draft,
    published,
    dirty: !sameBuildingEdits(draft, published),
    status,
    busy,
    onChange: (next) => {
      setDraft(next)
      latestDraft.current = next
      saveDraftSoon(next)
    },
    onPublish: () => void run(async () => {
      if (server) {
        // 남아 있는 초안 저장을 먼저 끝내고 공개합니다.
        window.clearTimeout(saveTimer.current)
        await call(API, { method: 'PUT', body: JSON.stringify({ draft: latestDraft.current }) })
        const result = await call(`${API}/publish`, { method: 'POST' })
        setPublished(sanitizeBuildingEdits(result.published))
      } else {
        writeLocal(PUBLISHED_KEY, latestDraft.current)
        setPublished(latestDraft.current)
      }
    }, '공개 지도에 반영했습니다(1분 안에 보입니다).'),
    onDiscard: () => void run(async () => {
      if (server) {
        window.clearTimeout(saveTimer.current)
        const result = await call(`${API}/discard`, { method: 'POST' })
        setDraft(sanitizeBuildingEdits(result.draft))
      } else {
        writeLocal(DRAFT_KEY, published)
        setDraft(published)
      }
    }, '초안을 버리고 공개된 상태로 되돌렸습니다.'),
  }
}

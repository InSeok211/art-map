import { useEffect, useRef, useState } from 'react'
import { sanitizeAlleys } from './alleys'
import type { Alley, LngLat } from './alleys'
import { sanitizeTrails } from './gpsTrails'
import type { GpsTrail } from './gpsTrails'
import type { GpsTrailStore } from './useAlleyFinder'
import { deleteTrail, postTrail } from './adminTrailApi'

// 관리자 골목지도 작업실의 골목길·GPS 기록 저장소입니다.
//  - 편집 앱(지도 앱 서버의 /studio/)에서 열리면 서버 데이터베이스(D1)에 저장합니다. 관리자로 로그인해야 쓸 수
//    있고, 공개 지도는 확인한 골목길만 /api/map-alleys로 받아 갑니다(GPS 기록은 공개되지 않음).
//  - 그 밖(개발 미리보기)에서는 이 브라우저에만 저장합니다.
const ALLEYS_KEY = 'gamcheon-map-alleys-v1'
const TRAILS_KEY = 'gamcheon-gps-trails-v1'
const DISMISSED_KEY = 'gamcheon-alley-dismissed-v1'
const ALLEYS_API = '/api/admin/map-alleys'
const TRAILS_API = '/api/admin/gps-trails'

function readLocal<T>(key: string, sanitize: (value: unknown) => T, fallback: T): T {
  try {
    const stored = localStorage.getItem(key)
    return stored === null ? fallback : sanitize(JSON.parse(stored))
  } catch {
    return fallback
  }
}
function writeLocal(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* 저장소를 못 쓰면 이번 화면에서만 유지됩니다. */ }
}
const sanitizeLines = (value: unknown): LngLat[][] => Array.isArray(value)
  ? value.filter((line): line is LngLat[] => Array.isArray(line) && line.length >= 2
    && line.every((point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)))
  : []

async function json(response: Response) {
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error(String(response.status))
  return response.json() as Promise<Record<string, unknown>>
}

const putTrail = (trails: GpsTrail[], trail: GpsTrail) => [...trails.filter((item) => item.id !== trail.id), trail]

export function useAlleyStore() {
  const hosted = document.documentElement.dataset.buildingEditServer === 'true'
  const [alleys, setAlleys] = useState<Alley[]>(() => readLocal(ALLEYS_KEY, sanitizeAlleys, []))
  const [trails, setTrails] = useState<GpsTrail[]>(() => readLocal(TRAILS_KEY, sanitizeTrails, []))
  const [dismissed, setDismissed] = useState<LngLat[][]>(() => readLocal(DISMISSED_KEY, sanitizeLines, []))
  const [server, setServer] = useState(false)
  const [ready, setReady] = useState(!hosted)
  const [notice, setNotice] = useState('')
  const saveTimer = useRef(0)
  const latest = useRef({ alleys, dismissed })
  latest.current = { alleys, dismissed }

  // 지도 앱 서버에서 열렸는지 확인하고, 그렇다면 저장된 골목길·기록을 불러옵니다.
  useEffect(() => {
    if (!hosted) return
    let cancelled = false
    ;(async () => {
      try {
        const saved = await json(await fetch(ALLEYS_API, { cache: 'no-store' }))
        const { trails: savedTrails } = await json(await fetch(TRAILS_API, { cache: 'no-store' }))
        if (cancelled) return
        const serverAlleys = sanitizeAlleys(saved.alleys)
        setServer(true)
        setTrails(sanitizeTrails(savedTrails))
        setDismissed(sanitizeLines(saved.dismissed))
        setAlleys(serverAlleys)
        setReady(true)
      } catch {
        if (!cancelled) setNotice('골목길 서버 데이터를 불러오지 못했습니다. 페이지를 새로고침해 주세요.')
      }
    })()
    return () => { cancelled = true }
  }, [hosted])

  async function putAlleys(nextAlleys: Alley[], nextDismissed: LngLat[][]) {
    const response = await fetch(ALLEYS_API, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ alleys: nextAlleys, dismissed: nextDismissed }),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string }
      throw new Error(body.error || '골목길을 저장하지 못했습니다.')
    }
  }

  // 점을 끄는 동안 여러 번 바뀌므로 잠시 모았다가 한 번에 저장합니다.
  function scheduleSave() {
    if (!server) return
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      putAlleys(latest.current.alleys, latest.current.dismissed)
        .then(() => setNotice(''))
        .catch((error: Error) => setNotice(`${error.message} 잠시 뒤 다시 고쳐 주세요.`))
    }, 800)
  }

  function updateAlleys(next: Alley[]) {
    if (!ready) return
    setAlleys(next)
    latest.current = { ...latest.current, alleys: next }
    writeLocal(ALLEYS_KEY, next)
    scheduleSave()
  }

  // 기록(GPX로 올린 것)을 저장합니다. 서버에서는 올린 뒤 서버가 정리해 돌려준 기록(범위 밖 점 제외)으로 목록을
  // 바꾸고, 개발 미리보기에서는 이 브라우저에 둡니다. 같은 번호의 기록은 새것으로 바꿉니다.
  async function saveTrail(trail: GpsTrail) {
    if (!ready) throw new Error('골목길 서버 데이터를 불러온 뒤 다시 시도해 주세요.')
    if (!server) {
      setTrails((current) => {
        const next = putTrail(current, trail)
        writeLocal(TRAILS_KEY, next)
        return next
      })
      return
    }
    const response = await postTrail(trail)
    const [saved] = sanitizeTrails([(await response.json() as { trail?: unknown }).trail])
    setTrails((current) => putTrail(current, saved ?? trail))
  }

  const gpsTrails: GpsTrailStore = {
    trails,
    dismissed,
    onAddTrail: (trail) => saveTrail(trail),
    onDeleteTrail: (id) => {
      if (!ready) return
      setTrails((current) => {
        const next = current.filter((trail) => trail.id !== id)
        if (!server) writeLocal(TRAILS_KEY, next)
        return next
      })
      if (server) deleteTrail(id).catch(() => setNotice('기록을 지우지 못했습니다. 새로고침 후 다시 시도해 주세요.'))
    },
    onDismiss: (line) => {
      if (!ready) return
      const next = [...dismissed, line]
      setDismissed(next)
      latest.current = { ...latest.current, dismissed: next }
      writeLocal(DISMISSED_KEY, next)
      scheduleSave()
    },
  }

  return { alleys, updateAlleys, gpsTrails, server, ready, notice }
}

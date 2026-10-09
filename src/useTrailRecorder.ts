import { useEffect, useRef, useState } from 'react'
import type { GpsTrail, TrailPoint } from './gpsTrails'
import { trailLengthMeters } from './gpsTrails'
import { newId } from './listUtils'

// 관리자가 걸으며 GPS 기록을 남기는 훅입니다. 골목에서는 인터넷이 자주 끊기므로 기록 중인 점은 이 기기에 먼저
// 저장해 두고(새로고침해도 이어서 기록할 수 있음), 끝낼 때 onSave로 올립니다. 올리지 못한 기록은 기기에 남겨
// 두었다가 다시 올립니다.
const DRAFT_KEY = 'gamcheon-trail-recording-v1'
const PENDING_KEY = 'gamcheon-trail-pending-v1'
const MIN_INTERVAL_MS = 1000
const MIN_POINTS = 5

function read<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key)
    return stored === null ? fallback : JSON.parse(stored) as T
  } catch {
    return fallback
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch { /* 저장소를 못 쓰면 메모리에만 둡니다. */ }
}

type WakeLockSentinelLike = { release: () => Promise<void> }

export function useTrailRecorder(onSave?: (trail: GpsTrail) => Promise<void> | void) {
  const [draft, setDraft] = useState<GpsTrail | null>(() => read<GpsTrail | null>(DRAFT_KEY, null))
  const [pending, setPending] = useState<GpsTrail[]>(() => read<GpsTrail[]>(PENDING_KEY, []))
  const [recording, setRecording] = useState(false)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [status, setStatus] = useState('')
  const watchRef = useRef<number | null>(null)
  const wakeRef = useRef<WakeLockSentinelLike | null>(null)
  const draftRef = useRef(draft)
  draftRef.current = draft

  function stopWatching() {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current)
    watchRef.current = null
    wakeRef.current?.release().catch(() => undefined)
    wakeRef.current = null
    setRecording(false)
  }

  useEffect(() => () => stopWatching(), [])

  // 화면이 꺼지면 브라우저가 GPS를 멈추므로, 기록하는 동안 화면이 켜져 있게 요청합니다(지원하는 브라우저만).
  async function keepAwake() {
    try {
      const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } }).wakeLock
      wakeRef.current = await wakeLock?.request('screen') ?? null
    } catch { /* 지원하지 않으면 화면을 켜 두라고 안내만 합니다. */ }
  }

  function start() {
    if (!('geolocation' in navigator)) return setStatus('이 기기에서는 위치를 쓸 수 없습니다.')
    const base = draftRef.current ?? { id: newId('trail'), startedAt: new Date().toISOString(), points: [] }
    setDraft(base)
    write(DRAFT_KEY, base)
    setStatus('위치를 찾는 중… 화면을 켠 채로 걸어 주세요.')
    setRecording(true)
    void keepAwake()
    watchRef.current = navigator.geolocation.watchPosition((position) => {
      const { longitude, latitude, accuracy: meters } = position.coords
      setAccuracy(Math.round(meters))
      setStatus('')
      const current = draftRef.current
      if (!current) return
      const last = current.points[current.points.length - 1]
      if (last && position.timestamp - last[3] < MIN_INTERVAL_MS) return
      const point: TrailPoint = [Math.round(longitude * 1e7) / 1e7, Math.round(latitude * 1e7) / 1e7, Math.round(meters * 10) / 10, position.timestamp]
      const next = { ...current, points: [...current.points, point] }
      draftRef.current = next
      setDraft(next)
      write(DRAFT_KEY, next)
    }, (error) => {
      setStatus(error.code === error.PERMISSION_DENIED ? '위치 권한을 허용해 주세요.' : '위치를 받지 못하고 있습니다. 하늘이 보이는 곳에서 잠시 기다려 주세요.')
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 })
  }

  async function upload(trails: GpsTrail[]) {
    const failed: GpsTrail[] = []
    for (const trail of trails) {
      try { await onSave?.(trail) } catch { failed.push(trail) }
    }
    setPending(failed)
    write(PENDING_KEY, failed.length ? failed : null)
    return failed.length === 0
  }

  async function finish() {
    stopWatching()
    const trail = draftRef.current
    setDraft(null)
    write(DRAFT_KEY, null)
    if (!trail || trail.points.length < MIN_POINTS) return setStatus('기록한 위치가 너무 적어 저장하지 않았습니다.')
    setStatus('기록을 저장하는 중…')
    const saved = await upload([...pending, trail])
    setStatus(saved ? `기록을 저장했습니다(약 ${Math.round(trailLengthMeters(trail))}m).` : '인터넷이 연결되면 "다시 올리기"를 눌러 주세요. 기록은 이 기기에 남아 있습니다.')
  }

  function discard() {
    stopWatching()
    setDraft(null)
    write(DRAFT_KEY, null)
    setStatus('')
  }

  return {
    recording,
    draft,
    accuracy,
    status,
    pendingCount: pending.length,
    start,
    finish,
    discard,
    pause: stopWatching,
    retry: async () => {
      setStatus('다시 올리는 중…')
      setStatus(await upload(pending) ? '남아 있던 기록을 올렸습니다.' : '아직 올리지 못했습니다.')
    },
  }
}

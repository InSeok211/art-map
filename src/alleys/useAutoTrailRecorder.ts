import { useEffect, useRef, useState } from 'react'
import type { GpsTrail, TrailPoint } from './gpsTrails'
import { classifyFix, isWorthSaving, newTrail } from './trailFixes'

// 관리자로 로그인해 지도를 열어 두면, 기록 버튼을 누르지 않아도 걸은 길을 자동으로 기록해 올립니다
// (골목길 후보 찾기용, gpsTrails.ts). 일반 방문자의 위치는 기록하지 않습니다.
//
//  - 어떤 점을 남기고 언제 새 기록으로 나눌지는 trailFixes.ts의 규칙을 따릅니다(GPX 올리기와 같음).
//  - 1분마다, 그리고 화면을 떠날 때 지금까지의 기록을 올립니다(같은 번호로 덮어써 저장).
//  - 기록하는 동안 화면이 저절로 꺼지지 않게 합니다(화면이 꺼지면 브라우저가 GPS를 멈춥니다).
const FLUSH_MS = 60_000

type WakeLockSentinelLike = { release: () => Promise<void> }


export function useAutoTrailRecorder(enabled: boolean, save: (trail: GpsTrail, options: { keepalive: boolean }) => Promise<void> | void) {
  const [paused, setPaused] = useState(false)
  const [pointCount, setPointCount] = useState(0)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const trailRef = useRef<GpsTrail | null>(null)
  const dirtyRef = useRef(false)
  const saveRef = useRef(save)
  saveRef.current = save
  const active = enabled && !paused

  function flush(keepalive = false) {
    const trail = trailRef.current
    if (!trail || !dirtyRef.current || !isWorthSaving(trail.points)) return
    dirtyRef.current = false
    Promise.resolve(saveRef.current({ ...trail, points: [...trail.points] }, { keepalive }))
      .then(() => setLastSaved(new Date()))
      .catch(() => { dirtyRef.current = true })
  }

  useEffect(() => {
    if (!active || !('geolocation' in navigator)) return
    const watch = navigator.geolocation.watchPosition((position) => {
      const { longitude, latitude, accuracy } = position.coords
      const point: TrailPoint = [Math.round(longitude * 1e7) / 1e7, Math.round(latitude * 1e7) / 1e7, Math.round(accuracy * 10) / 10, position.timestamp]
      let trail = trailRef.current
      const action = classifyFix(trail?.points, point)
      if (action === 'skip') return
      if (action === 'new') {
        flush()
        trail = newTrail(point)
        trailRef.current = trail
      } else trail!.points.push(point)
      dirtyRef.current = true
      setPointCount(trail!.points.length)
    }, () => { /* 위치를 못 받으면 기록하지 않습니다. */ }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30_000 })
    const timer = window.setInterval(() => flush(), FLUSH_MS)
    // 화면 꺼짐 방지: 화면이 다시 보일 때마다 다시 요청합니다(브라우저가 숨겨지면 풀어 버림).
    let wakeLock: WakeLockSentinelLike | null = null
    const keepAwake = () => {
      const api = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } }).wakeLock
      if (!api || document.visibilityState !== 'visible') return
      api.request('screen').then((lock) => { wakeLock = lock }).catch(() => { /* 지원하지 않거나 거절되면 그대로 둡니다. */ })
    }
    keepAwake()
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush(true)
      else keepAwake()
    }
    const onPageHide = () => flush(true)
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      navigator.geolocation.clearWatch(watch)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
      wakeLock?.release().catch(() => undefined)
      flush(true)
    }
  }, [active])

  return { enabled, recording: active, paused, pointCount, lastSaved, pause: () => setPaused(true), resume: () => setPaused(false) }
}

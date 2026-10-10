import { useEffect, useRef, useState } from 'react'
import type { GpsTrail, TrailPoint } from './gpsTrails'
import { TRAIL_ACCURACY_LIMIT } from './gpsTrails'
import { newId } from './listUtils'
import { distanceMeters, pathLengthMeters } from './streetCoordinates'

// 관리자로 로그인해 지도를 열어 두면, 기록 버튼을 누르지 않아도 걸은 길을 자동으로 기록해 올립니다
// (골목길 후보 찾기용, gpsTrails.ts). 일반 방문자의 위치는 기록하지 않습니다.
//
//  - 정확도가 20m보다 나쁜 점, 제자리에서 흔들린 점(직전 점에서 몇 m 안 움직임)은 버립니다. 사무실처럼 한곳에
//    오래 있어도 엉뚱한 골목 후보가 생기지 않게 합니다.
//  - 10분 넘게 끊기면(또는 기록이 너무 길어지면) 새 기록으로 시작합니다. 서로 다른 기록은 "서로 다른 시간"으로 셉니다.
//  - 1분마다, 그리고 화면을 떠날 때 지금까지의 기록을 올립니다(같은 번호로 덮어써 저장). 30m도 안 움직인 기록은
//    올리지 않습니다.
const NEW_TRAIL_GAP_MS = 10 * 60_000
// 화면을 떠날 때 보내는 요청(keepalive)은 64KB까지라, 기록 하나를 약 54KB(1200점) 안으로 나눕니다.
const MAX_POINTS = 1200
const FLUSH_MS = 60_000
const MIN_PATH_METERS = 30


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
    if (!trail || !dirtyRef.current || pathLengthMeters(trail.points) < MIN_PATH_METERS) return
    dirtyRef.current = false
    Promise.resolve(saveRef.current({ ...trail, points: [...trail.points] }, { keepalive }))
      .then(() => setLastSaved(new Date()))
      .catch(() => { dirtyRef.current = true })
  }

  useEffect(() => {
    if (!active || !('geolocation' in navigator)) return
    const watch = navigator.geolocation.watchPosition((position) => {
      const { longitude, latitude, accuracy } = position.coords
      if (accuracy > TRAIL_ACCURACY_LIMIT) return
      const point: TrailPoint = [Math.round(longitude * 1e7) / 1e7, Math.round(latitude * 1e7) / 1e7, Math.round(accuracy * 10) / 10, position.timestamp]
      let trail = trailRef.current
      const last = trail?.points[trail.points.length - 1]
      if (!trail || !last || point[3] - last[3] > NEW_TRAIL_GAP_MS || trail.points.length >= MAX_POINTS) {
        flush()
        trail = { id: newId('trail'), startedAt: new Date(point[3]).toISOString(), points: [point] }
        trailRef.current = trail
      } else {
        // 직전 점에서 충분히 움직였을 때만 남깁니다(제자리 흔들림 제외).
        if (distanceMeters(last, point) < Math.max(4, accuracy * 0.6)) return
        trail.points.push(point)
      }
      dirtyRef.current = true
      setPointCount(trail.points.length)
    }, () => { /* 위치를 못 받으면 기록하지 않습니다. */ }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30_000 })
    const timer = window.setInterval(() => flush(), FLUSH_MS)
    const onHide = () => { if (document.visibilityState === 'hidden') flush(true) }
    const onPageHide = () => flush(true)
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      navigator.geolocation.clearWatch(watch)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
      flush(true)
    }
  }, [active])

  return { enabled, recording: active, paused, pointCount, lastSaved, pause: () => setPaused(true), resume: () => setPaused(false) }
}

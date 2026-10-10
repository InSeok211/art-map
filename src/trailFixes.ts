import type { GpsTrail, TrailPoint } from './gpsTrails'
import { TRAIL_ACCURACY_LIMIT } from './gpsTrails'
import { newId } from './listUtils'
import { distanceMeters, pathLengthMeters } from './streetCoordinates'

// 위치(GPS 점)를 골목길 기록으로 모으는 규칙입니다. 지도의 자동 기록(useAutoTrailRecorder)과 GPS 기록 앱에서
// 올린 GPX(gpxImport)가 같은 규칙을 씁니다.
//  - 정확도가 20m보다 나쁜 점, 제자리에서 흔들린 점(직전 점에서 몇 m 안 움직임)은 버립니다. 한곳에 오래 있어도
//    엉뚱한 골목 후보가 생기지 않게 합니다.
//  - 10분 넘게 끊기거나 기록이 너무 길어지면 새 기록으로 나눕니다. 서로 다른 기록은 "서로 다른 시간"으로 셉니다.
//  - 30m도 안 움직인 기록은 저장하지 않습니다.
export const NEW_TRAIL_GAP_MS = 10 * 60_000
// 화면을 떠날 때 보내는 요청(keepalive)은 64KB까지라, 기록 하나를 약 54KB(1200점) 안으로 나눕니다.
export const MAX_TRAIL_POINTS = 1200
export const MIN_TRAIL_METERS = 30

// 새 점을 지금 기록에 어떻게 넣을지: 버림 / 새 기록 시작 / 이어 붙임
export function classifyFix(trail: TrailPoint[] | undefined, point: TrailPoint): 'skip' | 'new' | 'add' {
  if (point[2] > TRAIL_ACCURACY_LIMIT) return 'skip'
  const last = trail?.[trail.length - 1]
  if (!trail || !last || point[3] - last[3] > NEW_TRAIL_GAP_MS || trail.length >= MAX_TRAIL_POINTS) return 'new'
  return distanceMeters(last, point) < Math.max(4, point[2] * 0.6) ? 'skip' : 'add'
}

export const isWorthSaving = (points: TrailPoint[]) => pathLengthMeters(points) >= MIN_TRAIL_METERS

export function newTrail(point: TrailPoint): GpsTrail {
  return { id: newId('trail'), startedAt: new Date(point[3]).toISOString(), points: [point] }
}

// 시간순 점들을 위 규칙대로 기록들로 나눕니다(GPX 올리기).
export function splitIntoTrails(points: TrailPoint[]): GpsTrail[] {
  const trails: GpsTrail[] = []
  let current: GpsTrail | null = null
  for (const point of points) {
    const action = classifyFix(current?.points, point)
    if (action === 'new') {
      current = newTrail(point)
      trails.push(current)
    } else if (action === 'add') current!.points.push(point)
  }
  return trails.filter((trail) => isWorthSaving(trail.points))
}

// 고른 모델·건물의 이동·회전·크기 손잡이 계산입니다(장면 미터 [x, z], 각도는 긴 쪽이 가리키는 방향).
//  - 이동: 가운데. 끄는 곳이 새 가운데입니다.
//  - 회전: 긴 쪽 앞 끝(가운데에서 reach만큼). 가운데에서 끄는 곳을 향한 방향이 새 각도이고, 15° 배수 근처에서는
//    그 배수에 맞춥니다(자석 맞춤).
//  - 크기: 긴 쪽 뒤 끝. 가운데에서 끄는 곳까지의 거리가 새 reach입니다.
export type HandleKind = 'move' | 'rotate' | 'scale'
export const HANDLE_KINDS: readonly HandleKind[] = ['move', 'rotate', 'scale']

type Meters = [number, number]
export interface TransformFrame {
  center: Meters
  angle: number
  reach: number
}

export const SNAP_STEP = 15
export const SNAP_TOLERANCE = 4

// 15° 배수에서 4° 안쪽이면 그 배수로 맞춥니다. 0~360 사이로 돌려줍니다.
export function snapAngle(angle: number, step = SNAP_STEP, tolerance = SNAP_TOLERANCE) {
  const normal = ((angle % 360) + 360) % 360
  const nearest = Math.round(normal / step) * step
  const snapped = Math.abs(normal - nearest) <= tolerance ? nearest : normal
  return Math.round((snapped % 360) * 10) / 10
}

export function handlePosition(frame: TransformFrame, kind: HandleKind): Meters {
  if (kind === 'move') return frame.center
  const side = kind === 'rotate' ? 1 : -1
  const radians = frame.angle * Math.PI / 180
  return [frame.center[0] + Math.cos(radians) * frame.reach * side, frame.center[1] + Math.sin(radians) * frame.reach * side]
}

// 손잡이를 point까지 끌었을 때의 새 틀. reach는 [minReach, maxReach] 안으로 줄입니다.
export function dragFrame(frame: TransformFrame, kind: HandleKind, point: Meters, minReach: number, maxReach: number): TransformFrame {
  if (kind === 'move') return { ...frame, center: point }
  const dx = point[0] - frame.center[0], dz = point[1] - frame.center[1]
  if (kind === 'rotate') {
    if (Math.hypot(dx, dz) < 1e-6) return frame
    return { ...frame, angle: snapAngle(Math.atan2(dz, dx) * 180 / Math.PI) }
  }
  return { ...frame, reach: Math.min(maxReach, Math.max(minReach, Math.hypot(dx, dz))) }
}

// 손잡이를 끄는 동안 그 손잡이에 보여 줄 값
export function handleLabel(kind: HandleKind, start: TransformFrame, next: TransformFrame, describeReach: (reach: number) => string) {
  if (kind === 'move') return `${Math.hypot(next.center[0] - start.center[0], next.center[1] - start.center[1]).toFixed(1)}m`
  if (kind === 'rotate') return `${Math.round(next.angle)}°`
  return describeReach(next.reach)
}

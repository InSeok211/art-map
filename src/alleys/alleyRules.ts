import { isInsideGamcheonMap } from '../map/gamcheonBoundary'

// 골목길 하나의 규칙입니다. 편집 화면과 서버가 이 모듈 하나를 함께 씁니다. 골목길은 지도 전체에 그릴 수 있습니다.
// 공개 지도에 나가는 길이라 개인정보가 없습니다. GPS 기록의 좁은 작업 범위는 서버(server/alleys.ts)에 있습니다.
export const MAX_LINE_POINTS = 500
export const ALLEY_NAME_MAX = 60
const ALLEY_ID_MAX = 80
export const ALLEY_WIDTH_RANGE = { min: 1, max: 8, default: 3 } as const

/** 저장을 거부하거나 읽을 때 건너뛴 골목을 서버가 알려 주는 모양입니다. */
export type AlleyProblem = { index: number; id?: string; name?: string; reason: string }

/** 이름이 없는 골목은 편집 목록의 순서로 부릅니다. */
export const alleyLabel = ({ name }: { name?: string }, index: number) => name || `골목길 ${index + 1}`

/** 선이 규칙에 맞으면 null, 아니면 운영자에게 보여 줄 이유를 돌려줍니다. */
export function lineProblem(value: unknown): string | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_LINE_POINTS) return `점은 2~${MAX_LINE_POINTS}개여야 합니다.`
  for (const point of value) {
    if (!Array.isArray(point) || point.length !== 2 || !point.every((part) => typeof part === 'number' && Number.isFinite(part))) return '좌표 형식이 올바르지 않습니다.'
    if (!isInsideGamcheonMap(point[0], point[1])) return '지도 범위 밖의 점이 있습니다.'
  }
  return null
}

/** 골목길 하나가 규칙에 맞으면 null, 아니면 이유를 돌려줍니다. */
export function alleyProblem(value: unknown): string | null {
  if (!value || typeof value !== 'object') return '골목길 형식이 올바르지 않습니다.'
  const alley = value as { id?: unknown; name?: unknown; widthMeters?: unknown; coordinates?: unknown }
  if (typeof alley.id !== 'string' || !alley.id || alley.id.length > ALLEY_ID_MAX) return '골목길 번호가 올바르지 않습니다.'
  if (alley.name !== undefined && (typeof alley.name !== 'string' || alley.name.length > ALLEY_NAME_MAX)) return `이름은 ${ALLEY_NAME_MAX}자까지 쓸 수 있습니다.`
  if (typeof alley.widthMeters !== 'number' || !Number.isFinite(alley.widthMeters)
    || alley.widthMeters < ALLEY_WIDTH_RANGE.min || alley.widthMeters > ALLEY_WIDTH_RANGE.max) return `폭은 ${ALLEY_WIDTH_RANGE.min}~${ALLEY_WIDTH_RANGE.max}m여야 합니다.`
  return lineProblem(alley.coordinates)
}

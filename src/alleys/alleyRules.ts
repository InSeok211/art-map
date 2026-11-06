import { isInsideGamcheonMap } from '../map/gamcheonBoundary'

// 골목길과 GPS 기록의 범위 규칙입니다. 편집 화면과 서버가 이 모듈 하나를 함께 씁니다.
//  - 골목길은 지도 전체에 그릴 수 있습니다. 공개 지도에 나가는 길이라 개인정보가 없습니다.
//  - GPS 기록은 좁은 작업 범위 안의 점만 남깁니다. 집과 이동 경로가 서버에 남지 않게 하기 위해서입니다.
export const WORK_AREA = { west: 129.006, south: 35.09274, east: 129.0135, north: 35.0992 }
export const MAX_ALLEYS = 500
export const MAX_LINE_POINTS = 500
export const ALLEY_NAME_MAX = 60
export const ALLEY_ID_MAX = 80
export const ALLEY_WIDTH_RANGE = { min: 1, max: 8, default: 3 } as const

export const isInsideWorkArea = (longitude: number, latitude: number) =>
  longitude >= WORK_AREA.west && longitude <= WORK_AREA.east && latitude >= WORK_AREA.south && latitude <= WORK_AREA.north

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

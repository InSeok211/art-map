import type { StreetBuilding } from './streetSceneData'

// 관리자가 작업실 '건물' 탭에서 고친 지도 건물의 내용입니다(1단계: 자동으로 만든 건물 고치기).
// 홈페이지에는 초안(작업실에서만 보임)과 공개본(공개 지도) 두 벌로 저장하고, '공개하기'로 초안을 공개본에 옮깁니다.
// 건물은 OSM 건물 번호로 가리킵니다. 따로 만든 모델 건물(공방·그린하우스·아름다운한글)은 고칠 수 없습니다.

export type RoofStyle = StreetBuilding['roofStyle']

export interface BuildingOverride {
  hidden?: boolean
  heightMeters?: number
  wallColor?: number
  roofColor?: number
  roofStyle?: RoofStyle
}

export interface BuildingEdits {
  overrides: Record<string, BuildingOverride>
}

export const EMPTY_BUILDING_EDITS: BuildingEdits = { overrides: {} }
export const BUILDING_HEIGHT_RANGE = { min: 2.5, max: 60 } as const
// 층수 ↔ 높이: 자동으로 만든 건물과 같은 기준(층 2.65m + 지붕·기단 0.8m)
export const STORY_METERS = 2.65
export const floorsToHeight = (floors: number) => Math.round((floors * STORY_METERS + 0.8) * 100) / 100
export const heightToFloors = (height: number) => Math.max(1, Math.round((height - 0.8) / STORY_METERS))

const MAX_OVERRIDES = 3000
const isColor = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 0xffffff

function sanitizeOverride(value: unknown): BuildingOverride | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  const override: BuildingOverride = {}
  if (input.hidden === true) override.hidden = true
  const height = Number(input.heightMeters)
  if (input.heightMeters !== undefined && Number.isFinite(height)) {
    override.heightMeters = Math.min(BUILDING_HEIGHT_RANGE.max, Math.max(BUILDING_HEIGHT_RANGE.min, height))
  }
  if (isColor(input.wallColor)) override.wallColor = input.wallColor
  if (isColor(input.roofColor)) override.roofColor = input.roofColor
  if (input.roofStyle === 'flat' || input.roofStyle === 'gable') override.roofStyle = input.roofStyle
  return Object.keys(override).length ? override : null
}

// 저장된 값에서 쓸 수 있는 것만 남깁니다(모르는 값·잘못된 값은 버림).
export function sanitizeBuildingEdits(value: unknown): BuildingEdits {
  const overrides: Record<string, BuildingOverride> = {}
  const input = (value as { overrides?: unknown } | null)?.overrides
  if (input && typeof input === 'object') {
    for (const [id, raw] of Object.entries(input as Record<string, unknown>).slice(0, MAX_OVERRIDES)) {
      if (!/^\d+$/.test(id)) continue
      const override = sanitizeOverride(raw)
      if (override) overrides[id] = override
    }
  }
  return { overrides }
}

// 한 건물의 고친 내용을 바꿉니다. 빈 내용이면 그 건물을 원래대로 되돌립니다.
export function setOverride(edits: BuildingEdits, id: number, override: BuildingOverride | null): BuildingEdits {
  const overrides = { ...edits.overrides }
  const clean = override && sanitizeOverride(override)
  if (clean) overrides[id] = clean
  else delete overrides[id]
  return { overrides }
}

// 건물 목록에 고친 내용을 덮어씌웁니다. 숨긴 건물은 빼고, 고친 건물은 복사본을 돌려줍니다(원본은 그대로).
export function applyBuildingEdits(buildings: StreetBuilding[], edits: BuildingEdits | undefined): StreetBuilding[] {
  if (!edits || !Object.keys(edits.overrides).length) return buildings
  return buildings.flatMap((building) => {
    const override = edits.overrides[building.id]
    if (!override) return [building]
    if (override.hidden) return []
    return [{
      ...building,
      ...(override.heightMeters !== undefined ? { heightMeters: override.heightMeters } : {}),
      ...(override.wallColor !== undefined ? { wallColor: override.wallColor } : {}),
      ...(override.roofColor !== undefined ? { roofColor: override.roofColor } : {}),
      ...(override.roofStyle !== undefined ? { roofStyle: override.roofStyle } : {}),
    }]
  })
}

export const sameBuildingEdits = (a: BuildingEdits, b: BuildingEdits) => JSON.stringify(a.overrides) === JSON.stringify(b.overrides)
export const editedBuildingCount = (edits: BuildingEdits) => Object.keys(edits.overrides).length

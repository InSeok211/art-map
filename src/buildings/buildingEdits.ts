import type { StreetBuilding } from '../scene/streetSceneData'
import { isInsideGamcheonMap } from '../map/gamcheonBoundary'

// 관리자가 작업실 '건물' 탭에서 고친 지도 건물의 내용입니다
// (1단계: 자동으로 만든 건물 고치기, 2단계: 새 건물 그리기, 3단계: 올린 3D 모델(GLB)로 건물 바꾸기).
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

// 관리자가 직접 윤곽을 그려 더한 건물(경도·위도 윤곽, 닫는 점 없이)
export interface AddedBuilding {
  id: string
  outline: [number, number][]
  heightMeters: number
  wallColor: number
  roofColor: number
  roofStyle: RoofStyle
}

// 관리자가 올린 3D 모델(GLB 파일)을 지도에 둔 것. replaces의 건물(OSM 번호)은 지도에서 빠집니다.
// 모델은 바닥 가운데를 (경도, 위도)에 두고, 바닥의 긴 쪽이 widthMeters가 되게 늘이거나 줄여 rotation(도)만큼 돌립니다.
export interface PlacedModel {
  id: string
  // 홈페이지에 올린 모델 파일 번호(m-로 시작)
  modelId: string
  name: string
  longitude: number
  latitude: number
  rotation: number
  widthMeters: number
  replaces: number[]
}

export interface BuildingEdits {
  overrides: Record<string, BuildingOverride>
  added: AddedBuilding[]
  models: PlacedModel[]
}

export const EMPTY_BUILDING_EDITS: BuildingEdits = { overrides: {}, added: [], models: [] }
export const MODEL_WIDTH_RANGE = { min: 1, max: 120 } as const
export const MODEL_FILE_ID = /^m-[a-z0-9]{8,40}$/
// 새 건물을 처음 그렸을 때의 모양(2층, 흰 벽, 파란 지붕, 평지붕)
export const NEW_BUILDING_DEFAULTS = { heightMeters: 6.1, wallColor: 0xf2efe6, roofColor: 0x3f8fb5, roofStyle: 'flat' as RoofStyle }
export const ADDED_OUTLINE_POINTS = { min: 3, max: 60 } as const
export const BUILDING_HEIGHT_RANGE = { min: 2.5, max: 60 } as const
// 층수 ↔ 높이: 자동으로 만든 건물과 같은 기준(층 2.65m + 지붕·기단 0.8m)
export const STORY_METERS = 2.65
export const floorsToHeight = (floors: number) => Math.round((floors * STORY_METERS + 0.8) * 100) / 100
export const heightToFloors = (height: number) => Math.max(1, Math.round((height - 0.8) / STORY_METERS))

const MAX_OVERRIDES = 3000
const MAX_ADDED = 500
const MAX_MODELS = 100
const MAX_REPLACES = 20
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

function sanitizeAdded(value: unknown): AddedBuilding | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  if (typeof input.id !== 'string' || !/^[\w-]{1,80}$/.test(input.id) || !Array.isArray(input.outline)) return null
  const outline = input.outline.filter((point): point is [number, number] => Array.isArray(point) && point.length === 2
    && point.every((part) => Number.isFinite(part)) && isInsideGamcheonMap(point[0], point[1]))
  if (outline.length !== input.outline.length || outline.length < ADDED_OUTLINE_POINTS.min || outline.length > ADDED_OUTLINE_POINTS.max) return null
  const height = Number(input.heightMeters)
  if (!Number.isFinite(height) || !isColor(input.wallColor) || !isColor(input.roofColor)) return null
  if (input.roofStyle !== 'flat' && input.roofStyle !== 'gable') return null
  return {
    id: input.id,
    outline: outline.map(([lng, lat]) => [Math.round(lng * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7]),
    heightMeters: Math.min(BUILDING_HEIGHT_RANGE.max, Math.max(BUILDING_HEIGHT_RANGE.min, height)),
    wallColor: input.wallColor, roofColor: input.roofColor, roofStyle: input.roofStyle,
  }
}

function sanitizeModel(value: unknown): PlacedModel | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  if (typeof input.id !== 'string' || !/^[\w-]{1,80}$/.test(input.id)) return null
  if (typeof input.modelId !== 'string' || !MODEL_FILE_ID.test(input.modelId)) return null
  const longitude = Number(input.longitude), latitude = Number(input.latitude)
  if (!isInsideGamcheonMap(longitude, latitude)) return null
  const rotation = Number(input.rotation), width = Number(input.widthMeters)
  if (!Number.isFinite(rotation) || !Number.isFinite(width)) return null
  const replaces = Array.isArray(input.replaces)
    ? [...new Set(input.replaces.filter((id): id is number => Number.isSafeInteger(id) && Number(id) > 0))].slice(0, MAX_REPLACES)
    : []
  return {
    id: input.id,
    modelId: input.modelId,
    name: typeof input.name === 'string' ? input.name.slice(0, 80) : '',
    longitude: Math.round(longitude * 1e7) / 1e7,
    latitude: Math.round(latitude * 1e7) / 1e7,
    rotation: Math.round((((rotation % 360) + 360) % 360) * 10) / 10 % 360,
    widthMeters: Math.round(Math.min(MODEL_WIDTH_RANGE.max, Math.max(MODEL_WIDTH_RANGE.min, width)) * 10) / 10,
    replaces,
  }
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
  const addedInput = (value as { added?: unknown } | null)?.added
  const added = Array.isArray(addedInput)
    ? addedInput.slice(0, MAX_ADDED).flatMap((item) => sanitizeAdded(item) ?? [])
    : []
  const modelInput = (value as { models?: unknown } | null)?.models
  const models = Array.isArray(modelInput)
    ? modelInput.slice(0, MAX_MODELS).flatMap((item) => sanitizeModel(item) ?? [])
    : []
  return { overrides, added, models }
}

// 한 건물의 고친 내용을 바꿉니다. 빈 내용이면 그 건물을 원래대로 되돌립니다.
export function setOverride(edits: BuildingEdits, id: number, override: BuildingOverride | null): BuildingEdits {
  const overrides = { ...edits.overrides }
  const clean = override && sanitizeOverride(override)
  if (clean) overrides[id] = clean
  else delete overrides[id]
  return { ...edits, overrides }
}

// 새 건물을 더하거나 바꿉니다(같은 번호면 바꿈). null이면 그 번호의 새 건물을 지웁니다.
export function setAdded(edits: BuildingEdits, id: string, building: AddedBuilding | null): BuildingEdits {
  const clean = building && sanitizeAdded(building)
  const rest = edits.added.filter((item) => item.id !== id)
  if (!clean) return { ...edits, added: rest }
  const index = edits.added.findIndex((item) => item.id === id)
  const added = [...edits.added]
  if (index >= 0) added[index] = clean
  else added.push(clean)
  return { ...edits, added }
}

// 배치한 모델을 더하거나 바꿉니다(같은 번호면 바꿈). null이면 그 모델을 지웁니다(바꾼 건물이 다시 보임).
export function setModel(edits: BuildingEdits, id: string, model: PlacedModel | null): BuildingEdits {
  const clean = model && sanitizeModel(model)
  if (!clean) return { ...edits, models: edits.models.filter((item) => item.id !== id) }
  const index = edits.models.findIndex((item) => item.id === id)
  const models = [...edits.models]
  if (index >= 0) models[index] = clean
  else models.push(clean)
  return { ...edits, models }
}

// 모델이 대신하는 건물 번호(지도에서 빠짐)
export const replacedBuildingIds = (edits: BuildingEdits | undefined) => new Set(edits?.models.flatMap((model) => model.replaces) ?? [])

// 모델 파일 주소. 홈페이지에서는 /api/map-models/<번호>, 개발 미리보기는 이 브라우저에 담아 둔 파일(modelLibrary.ts)을 씁니다.
let localModelSource: ((modelId: string) => Promise<string | null>) | null = null
export function setLocalModelSource(source: typeof localModelSource) { localModelSource = source }
export async function resolveModelUrl(modelId: string) {
  return (await localModelSource?.(modelId).catch(() => null)) ?? `/api/map-models/${modelId}`
}

// 새 건물은 OSM 번호가 없으므로, 장면 안에서 쓸 음수 번호를 문자열 번호에서 만듭니다(OSM 번호와 겹치지 않음).
export function addedBuildingNumber(id: string) {
  let hash = 2166136261
  for (let index = 0; index < id.length; index++) hash = Math.imul(hash ^ id.charCodeAt(index), 16777619)
  return -1 - ((hash >>> 0) % 2_000_000_000)
}

// 새 건물을 자동으로 만든 일반 건물과 같은 모양 데이터로 바꿉니다(같은 3D 생성 코드로 그림).
export function addedToStreetBuilding(building: AddedBuilding): StreetBuilding {
  return {
    id: addedBuildingNumber(building.id),
    outline: building.outline,
    heightMeters: building.heightMeters,
    wallColor: building.wallColor,
    roofColor: building.roofColor,
    roofFinish: building.roofStyle === 'gable' ? 'sheet' : 'concrete',
    accentColor: 0x828a86,
    storefront: false,
    shopfrontStyle: 'glass',
    roofStyle: building.roofStyle,
    brickFacade: false,
    detail: 'context',
    progress: 0,
  }
}

// 건물 목록에 고친 내용을 덮어씌우고 새 건물을 더합니다. 숨긴 건물은 빼고, 고친 건물은 복사본을 돌려줍니다(원본은 그대로).
export function applyBuildingEdits(buildings: StreetBuilding[], edits: BuildingEdits | undefined): StreetBuilding[] {
  if (!edits || (!Object.keys(edits.overrides).length && !edits.added.length && !edits.models.length)) return buildings
  const replaced = replacedBuildingIds(edits)
  return [...buildings.flatMap((building) => {
    if (replaced.has(building.id)) return []
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
  }), ...edits.added.map(addedToStreetBuilding)]
}

export const sameBuildingEdits = (a: BuildingEdits, b: BuildingEdits) =>
  JSON.stringify(a.overrides) === JSON.stringify(b.overrides) && JSON.stringify(a.added) === JSON.stringify(b.added)
  && JSON.stringify(a.models) === JSON.stringify(b.models)
export const editedBuildingCount = (edits: BuildingEdits) => Object.keys(edits.overrides).length + edits.added.length + edits.models.length

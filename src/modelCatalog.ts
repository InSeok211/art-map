function modelUrl(style: 'rounded' | 'angular' | 'custom', name: string): string {
  const relativePath = `./assets/models/${style}/${name}`
  return new URL(relativePath, import.meta.url).href
}

export type ModelStyle = 'rounded' | 'angular' | 'custom'

export interface ModelAsset {
  id: string
  name: string
  style: ModelStyle
  category: 'building' | 'nature' | 'street'
  url: string
  defaultWidth: number
}

export interface MapModel {
  id: string
  assetId: string
  longitude: number
  latitude: number
  widthMeters: number
  rotation: number
  altitudeMeters: number
}

// 기본 에셋은 프로젝트에서 직접 만든 공방과 연결형 그린하우스 시안입니다.
export const BUILTIN_MODELS: ModelAsset[] = [
  { id: 'artist-workshop', name: '작가님 공방 · 옥천로101번길 23', style: 'rounded', category: 'building', url: modelUrl('custom', 'artist-workshop-180.glb'), defaultWidth: 15.5 },
  { id: 'greenhouse-sixpence', name: '그린하우스 · 달과6펜스 연결형 시안', style: 'custom', category: 'building', url: modelUrl('custom', 'greenhouse-sixpence-connected.glb'), defaultWidth: 22 },
  { id: 'beautiful-hangul', name: '아름다운한글 · 서예 공방', style: 'custom', category: 'building', url: modelUrl('custom', 'beautiful-hangul-studio.glb'), defaultWidth: 10.5 },
]

// 예전에 기본으로 들어 있던 외부 제작 모델의 번호입니다. 라이선스 정리로 뺐으므로, 브라우저에 저장된
// 예전 배치에서 이 모델을 쓰는 항목은 불러올 때 지웁니다.
export const RETIRED_ASSET_IDS = new Set([
  'rounded-house', 'rounded-shop', 'rounded-cafe', 'rounded-townhouse', 'rounded-pine', 'rounded-fruit', 'rounded-flower', 'rounded-lamp',
  'angular-house', 'angular-shop', 'angular-townhouse', 'angular-pine', 'angular-fruit', 'angular-flower', 'angular-lamp',
])

export function sanitizeModels(value: unknown, assets?: readonly ModelAsset[]): MapModel[] {
  if (!Array.isArray(value)) return []
  const ids = assets && new Set(assets.map((asset) => asset.id))
  return value.filter((item): item is MapModel => {
    if (!item || typeof item !== 'object') return false
    const model = item as Partial<MapModel>
    return typeof model.id === 'string' && typeof model.assetId === 'string' && (!ids || ids.has(model.assetId))
      && Number.isFinite(model.longitude) && Number.isFinite(model.latitude)
      && Number.isFinite(model.widthMeters) && Number(model.widthMeters) > 0 && Number(model.widthMeters) <= 200
      && Number.isFinite(model.rotation) && Number.isFinite(model.altitudeMeters)
  })
}

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

export const BUILTIN_MODELS: ModelAsset[] = [
  { id: 'artist-workshop', name: '작가님 공방 · 옥천로101번길 23', style: 'rounded', category: 'building', url: modelUrl('custom', 'artist-workshop-180.glb'), defaultWidth: 15.5 },
  { id: 'rounded-house', name: '작은 주택', style: 'rounded', category: 'building', url: modelUrl('rounded', 'common-buildings-small-family-house-compact-normal.glb'), defaultWidth: 18 },
  { id: 'rounded-shop', name: '골목 가게', style: 'rounded', category: 'building', url: modelUrl('rounded', 'common-buildings-corner-retail-shell-compact-normal.glb'), defaultWidth: 18 },
  { id: 'rounded-cafe', name: '카페', style: 'rounded', category: 'building', url: modelUrl('rounded', 'restaurant-pancake-cafe-building-cottage-normal.glb'), defaultWidth: 18 },
  { id: 'rounded-townhouse', name: '연립주택 입구', style: 'rounded', category: 'building', url: modelUrl('rounded', 'common-buildings-townhouse-entrance-module-compact-normal.glb'), defaultWidth: 16 },
  { id: 'rounded-pine', name: '소나무', style: 'rounded', category: 'nature', url: modelUrl('rounded', 'common-nature-small-pine-tree-cottage-normal.glb'), defaultWidth: 8 },
  { id: 'rounded-fruit', name: '과일나무', style: 'rounded', category: 'nature', url: modelUrl('rounded', 'common-nature-small-fruit-tree-cottage-normal.glb'), defaultWidth: 7 },
  { id: 'rounded-flower', name: '수국 덤불', style: 'rounded', category: 'nature', url: modelUrl('rounded', 'common-nature-flowering-hydrangea-bush-cottage-normal.glb'), defaultWidth: 5 },
  { id: 'rounded-lamp', name: '가로등', style: 'rounded', category: 'street', url: modelUrl('rounded', 'common-infrastructure-street-lamp-column-civic-normal.glb'), defaultWidth: 3 },
  { id: 'angular-house', name: '작은 주택', style: 'angular', category: 'building', url: modelUrl('angular', 'angular-common-buildings-small-family-house-compact-normal.glb'), defaultWidth: 18 },
  { id: 'angular-shop', name: '골목 가게', style: 'angular', category: 'building', url: modelUrl('angular', 'angular-common-buildings-corner-retail-shell-compact-normal.glb'), defaultWidth: 18 },
  { id: 'angular-townhouse', name: '연립주택 입구', style: 'angular', category: 'building', url: modelUrl('angular', 'angular-common-buildings-townhouse-entrance-module-compact-normal.glb'), defaultWidth: 16 },
  { id: 'angular-pine', name: '소나무', style: 'angular', category: 'nature', url: modelUrl('angular', 'angular-common-nature-small-pine-tree-cottage-normal.glb'), defaultWidth: 8 },
  { id: 'angular-fruit', name: '과일나무', style: 'angular', category: 'nature', url: modelUrl('angular', 'angular-common-nature-small-fruit-tree-cottage-normal.glb'), defaultWidth: 7 },
  { id: 'angular-flower', name: '수국 덤불', style: 'angular', category: 'nature', url: modelUrl('angular', 'angular-common-nature-flowering-hydrangea-bush-cottage-normal.glb'), defaultWidth: 5 },
  { id: 'angular-lamp', name: '가로등', style: 'angular', category: 'street', url: modelUrl('angular', 'angular-common-infrastructure-street-lamp-column-civic-normal.glb'), defaultWidth: 3 },
]

// These generic sample buildings do not represent verified Gamcheon houses.
// Keep the workshop and any user-imported GLB models when cleaning a preview.
export const GENERIC_BUILDING_ASSET_IDS = new Set(
  BUILTIN_MODELS.filter((asset) => asset.category === 'building' && asset.id !== 'artist-workshop')
    .map((asset) => asset.id),
)

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

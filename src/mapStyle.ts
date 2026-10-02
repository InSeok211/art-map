import { gamcheonMapAreaFeature, gamcheonOutsideFeature, isBuildingInsideGamcheon2 } from './gamcheonBoundary'
import gamcheonBuildings from './gamcheon-buildings.json'
import { PHOTOGRAPHED_STREET_GEOJSON } from './streetSceneData'

const localBuildingFootprints = {
  ...gamcheonBuildings,
  features: gamcheonBuildings.features.filter((feature) =>
    feature.geometry.type === 'Polygon' && isBuildingInsideGamcheon2(feature.geometry.coordinates[0])),
}

// 사용자가 그린 골목길(alleys.ts)의 폭입니다. 배경지도의 도로는 실제보다 굵게 그려지므로
// 실제 미터 대신 기본 폭 3m가 배경지도 골목(highway_minor)과 같은 굵기가 되도록 비례시킵니다.
const alleyScale = ['/', ['get', 'width'], 3]
const scaled = (pixels: number) => ['*', alleyScale, pixels]
// highway_minor와 아래 highway_minor_casing의 굵기 곡선을 폭에 비례해 그대로 따릅니다.
const alleyFillWidth = ['interpolate', ['exponential', 1.55], ['zoom'], 13, scaled(1.8), 20, scaled(20)]
const alleyCasingWidth = ['interpolate', ['linear'], ['zoom'], 13, scaled(3.5), 16, scaled(8), 20, scaled(23)]

export const ALLEY_SOURCE_ID = 'gamcheonAlleys'
export const ALLEY_DRAFT_SOURCE_ID = 'gamcheonAlleyDraft'
// 길찾기 경로 선입니다. 3D 층 위에 보이도록 GamcheonMap이 3D 층을 붙인 뒤 맨 위로 올립니다(ROUTE_LAYER_IDS).
export const ROUTE_SOURCE_ID = 'gamcheonRoute'
export const ROUTE_LAYER_IDS = ['route-casing', 'route-line']
// 3D 모델이 가리면 모델을 반투명하게 만드는 길 레이어입니다(ModelLayer).
export const ROAD_LAYER_IDS = [
  'highway_path', 'highway_minor', 'highway_major_inner',
  'highway_motorway_inner', 'highway_motorway_bridge_inner', 'alley-fill',
]
const EMPTY_COLLECTION = { type: 'FeatureCollection', features: [] }

export interface StyleWithLayers {
  sources: Record<string, unknown>
  layers: Array<{ id: string; type: string; source?: string; minzoom?: number; filter?: unknown; layout?: Record<string, unknown>; paint?: Record<string, unknown>; 'source-layer'?: string }>
}

// 실제 건물 위치를 확인하는 참고용 외곽선입니다. 기본은 숨김이며 지도 도구 버튼으로 켭니다.
// 벡터 타일의 건물은 z13~14 타일에만 있어 줌에 따라 사라지므로 저장한 OSM 사본(scripts/fetch-buildings.mjs)을 씁니다.
export const BUILDING_FOOTPRINT_LAYER_IDS = ['building-footprint-fill', 'building-footprint-line'] as const

const paintOverrides: Record<string, Record<string, unknown>> = {
  background: { 'background-color': '#eef5ee' },
  park: { 'fill-color': '#d8e9c2', 'fill-outline-color': '#c5d9b5' },
  water: { 'fill-color': '#73c7b8', 'fill-outline-color': '#56b4a8' },
  landuse_residential: { 'fill-color': '#e7f0e8', 'fill-opacity': 0.7 },
  landcover_wood: { 'fill-color': '#9ac7a4', 'fill-outline-color': '#87b896' },
  waterway: { 'line-color': '#69bdaf' },
  road_area_pier: { 'fill-color': '#eef5ee' },
  road_pier: { 'line-color': '#eef5ee' },
  highway_path: { 'line-color': '#d4b681', 'line-opacity': 0.9 },
  highway_minor: { 'line-color': '#fffaf0', 'line-opacity': 1 },
  highway_major_casing: { 'line-color': '#ccbda7' },
  highway_major_inner: { 'line-color': '#fffaf0' },
  highway_major_subtle: { 'line-color': '#e7dac7' },
  highway_motorway_casing: { 'line-color': '#c8b69c' },
  highway_motorway_inner: { 'line-color': '#fffaf0' },
  highway_motorway_subtle: { 'line-color': '#e7dac7' },
  highway_motorway_bridge_casing: { 'line-color': '#c8b69c' },
  highway_motorway_bridge_inner: { 'line-color': '#fffaf0' },
  railway: { 'line-color': '#b9ac9d' },
  railway_service: { 'line-color': '#b9ac9d' },
  railway_transit: { 'line-color': '#b9ac9d' },
  boundary_2: { 'line-color': '#aebfa1' },
  boundary_3: { 'line-color': '#aebfa1' },
  boundary_disputed: { 'line-color': '#aebfa1' },
}

export function createMinimalStyle<T extends StyleWithLayers>(style: T): T {
  const layers: StyleWithLayers['layers'] = style.layers
    .filter((layer) => layer.type !== 'symbol' && layer['source-layer'] !== 'building')
    .map((layer) => ({
      ...layer,
      paint: { ...layer.paint, ...paintOverrides[layer.id] },
    }))

  const minorIndex = layers.findIndex((layer) => layer.id === 'highway_minor')
  if (minorIndex >= 0) {
    const minor = layers[minorIndex]
    layers.splice(minorIndex, 0, {
      ...minor,
      id: 'highway_minor_casing',
      paint: {
        ...minor.paint,
        'line-color': '#d7cbb8',
        'line-opacity': 1,
        'line-width': ['interpolate', ['linear'], ['zoom'], 13, 3.5, 16, 8, 20, 23],
      },
    })
    // 골목길 윤곽은 기존 도로 윤곽 바로 위, 골목길 면은 기존 도로 면 바로 위에 두어 교차점이 한 길처럼 이어집니다.
    const alleyLayout = { 'line-cap': 'round', 'line-join': 'round' }
    layers.splice(minorIndex + 1, 0, {
      id: 'alley-casing',
      type: 'line',
      source: ALLEY_SOURCE_ID,
      layout: alleyLayout,
      paint: { 'line-color': ['case', ['get', 'selected'], '#e78349', '#d7cbb8'], 'line-width': alleyCasingWidth },
    })
    layers.splice(minorIndex + 3, 0, {
      id: 'alley-fill',
      type: 'line',
      source: ALLEY_SOURCE_ID,
      layout: alleyLayout,
      paint: { 'line-color': '#fffaf0', 'line-width': alleyFillWidth },
    })
  }

  layers.push(
    {
      id: 'photographed-street-casing',
      type: 'line',
      source: 'photographedStreet',
      minzoom: 16,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#c5a967', 'line-width': ['interpolate', ['linear'], ['zoom'], 16, 2.5, 17, 6, 18, 13, 19, 27] },
    },
    {
      id: 'photographed-street-paving',
      type: 'line',
      source: 'photographedStreet',
      minzoom: 16,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#98a9a8', 'line-width': ['interpolate', ['linear'], ['zoom'], 16, 2, 17, 4.5, 18, 10.5, 19, 23] },
    },
    {
      id: 'building-footprint-fill',
      type: 'fill',
      source: 'gamcheonBuildings',
      layout: { visibility: 'none' },
      paint: { 'fill-color': '#e78349', 'fill-opacity': 0.22 },
    },
    {
      id: 'building-footprint-line',
      type: 'line',
      source: 'gamcheonBuildings',
      layout: { visibility: 'none' },
      paint: { 'line-color': '#c0612b', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.5, 18, 1.5] },
    },
    {
      id: 'alley-draft-line',
      type: 'line',
      source: ALLEY_DRAFT_SOURCE_ID,
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#e78349', 'line-width': 3, 'line-dasharray': [1.5, 1.2] },
    },
    {
      id: 'alley-draft-points',
      type: 'circle',
      source: ALLEY_DRAFT_SOURCE_ID,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': 5, 'circle-color': '#fff', 'circle-stroke-color': '#e78349', 'circle-stroke-width': 2.5 },
    },
    {
      id: 'route-casing',
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 5, 18, 11, 21, 18] },
    },
    {
      id: 'route-line',
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#2f6fd6', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 3, 18, 7, 21, 12] },
    },
    {
      id: 'gamcheon-outside',
      type: 'fill',
      source: 'gamcheonOutside',
      paint: { 'fill-color': '#e8eee6', 'fill-opacity': 1 },
    },
    {
      id: 'gamcheon-edge-halo',
      type: 'line',
      source: 'gamcheonMapArea',
      paint: { 'line-color': '#fff9eb', 'line-width': 7, 'line-blur': 2 },
    },
    {
      id: 'gamcheon-edge',
      type: 'line',
      source: 'gamcheonMapArea',
      paint: { 'line-color': '#8eae97', 'line-width': 1.5 },
    },
  )

  return {
    ...style,
    sources: {
      ...style.sources,
      gamcheonMapArea: { type: 'geojson', data: gamcheonMapAreaFeature },
      gamcheonOutside: { type: 'geojson', data: gamcheonOutsideFeature },
      gamcheonBuildings: { type: 'geojson', data: localBuildingFootprints },
      photographedStreet: { type: 'geojson', data: PHOTOGRAPHED_STREET_GEOJSON },
      [ALLEY_SOURCE_ID]: { type: 'geojson', data: EMPTY_COLLECTION },
      [ALLEY_DRAFT_SOURCE_ID]: { type: 'geojson', data: EMPTY_COLLECTION },
      [ROUTE_SOURCE_ID]: { type: 'geojson', data: EMPTY_COLLECTION },
    },
    layers,
  } as T
}

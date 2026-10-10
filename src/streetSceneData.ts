import buildingFootprints from './gamcheon-buildings.json'
import { STREET_ORIGIN, streetLngLat, streetMeters } from './streetCoordinates'
import bakedOutlines from './generated/building-outlines.json'
import mapSurfaces from './street-surfaces.json'
import { RECORDED_ALLEY_WAYS } from './recordedAlleys'
import * as polygonClipping from 'polygon-clipping'
import { isBuildingInBuildingArea, isInsideGamcheonMap } from './gamcheonBoundary'
import { ALLEY_EDGE, FOOT_ROAD_TYPES, PHOTOGRAPHED_ROAD_WIDTH, roadOutlines, roadWidth } from './roadCorridors'

export type StreetPoint = [longitude: number, latitude: number]

// The photographed stretch follows Okcheon-ro 75beon-gil northward, then bends
// east on Gamnae 1-ro toward the artist workshop. Coordinates are OSM way nodes.
export const PHOTOGRAPHED_STREET: StreetPoint[] = [
  [129.00884, 35.0943657],
  [129.0088361, 35.0944591],
  [129.0088476, 35.0946977],
  [129.0088577, 35.0950346],
  [129.0088599, 35.0952082],
  [129.0088883, 35.0953477],
  [129.0089102, 35.0953967],
  [129.008984, 35.0954101],
  [129.0090949, 35.0954506],
  [129.0091761, 35.0954986],
  [129.0091904, 35.0955217],
]

// 촬영 거리 갈림길의 원형 포장 무늬. 카카오 스카이뷰 L1에서 잰 중심과 바깥 반지름입니다. 촬영 거리가 굽는
// OSM 노드(129.0089102, 35.0953967)보다 서북서쪽으로 약 3.7m 떨어져 있고, 둘레 건물(174 문화반점 등)과 겹치지 않습니다.
export const MEETING_CIRCLE_CENTER: StreetPoint = [129.0088756, 35.0954142]
export const MEETING_CIRCLE_RADIUS = 2.85

// 좌표 기준과 경도·위도 ↔ 장면 미터 변환은 streetCoordinates.ts에 있습니다(예전처럼 여기서도 내보냄).
export { STREET_ORIGIN, streetMeters }
const streetPoint = streetLngLat

const LINE_METERS = PHOTOGRAPHED_STREET.map(streetMeters)
const lengths = LINE_METERS.slice(1).map((point, index) => Math.hypot(point[0] - LINE_METERS[index][0], point[1] - LINE_METERS[index][1]))
const totalLength = lengths.reduce((sum, length) => sum + length, 0)

export function nearestStreet(point: StreetPoint) {
  const [x, z] = streetMeters(point)
  let best = { distanceMeters: Infinity, progress: 0, side: 0, point: [0, 0] as [number, number] }
  let passed = 0
  for (let index = 0; index < LINE_METERS.length - 1; index++) {
    const [ax, az] = LINE_METERS[index]
    const [bx, bz] = LINE_METERS[index + 1]
    const dx = bx - ax
    const dz = bz - az
    const length = lengths[index]
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (length * length)))
    const px = ax + t * dx
    const pz = az + t * dz
    const distanceMeters = Math.hypot(x - px, z - pz)
    if (distanceMeters < best.distanceMeters) {
      best = {
        distanceMeters,
        progress: (passed + t * length) / totalLength,
        side: Math.sign(dx * (z - az) - dz * (x - ax)),
        point: [px, pz],
      }
    }
    passed += length
  }
  return best
}

export interface FacadeOpening {
  offsetFraction: number
  centerY: number
  width: number
  height: number
  kind: 'window' | 'door'
  bars?: boolean
}

export interface StreetBuilding {
  id: number
  outline: StreetPoint[]
  heightMeters: number
  wallColor: number
  roofColor: number
  accentColor: number
  storefront: boolean
  shopfrontStyle: 'glass' | 'shutter'
  roofStyle: 'flat' | 'gable'
  brickFacade: boolean
  detail: 'featured' | 'context'
  progress: number
  concept?: 'soup' | 'chinese' | 'mart' | 'handmade' | 'fofos' | 'pink'
  observed?: {
    frame: number
    surface: 'brick' | 'plaster' | 'panel' | 'wood'
    ground: 'glass' | 'shutter' | 'house'
    awning?: number
    windowRows: number
    windowColumns?: number
    lowerWallColor?: number
    balcony?: boolean
  }
  roadview?: {
    captured: '2025-11'
    matchConfidence: 'high' | 'medium'
    surface: 'brick' | 'plaster' | 'panel' | 'wood'
    ground: 'glass' | 'shutter' | 'house' | 'window' | 'shutter-glass'
    awning?: number
    awningProfile?: 'curved'
    groundWindowWidth?: number
    groundWindowColumns?: number
    windowStartHeight?: number
    upperWindowWidth?: number
    windowSpacing?: number
    barSpacing?: number
    windowRows: number
    // The OSM centerline beside these facades identifies the street-facing wall.
    frontRoad: StreetPoint[]
    baseColor?: number
    lowerWallColor?: number
    doorColor?: number
    lowerWallHeight?: number
    tileGrid?: boolean
    bands?: { height: number; color: number; thickness: number }[]
    sign?: { text: string; color: number; ink: number; offsetFraction?: number; widthFraction?: number; centerY?: number; panelHeight?: number }
    windowColumns?: number
    stoneBaseHeight?: number
    balcony?: boolean
    windowBars?: boolean
    parapetColor?: number
    roofRailing?: boolean
    drainpipe?: boolean
    roofColorVerified?: boolean
    cloudMural?: boolean
    openings?: FacadeOpening[]
  }
  inferred?: {
    // 외관을 빌려 온 확인 건물들의 OSM 윤곽 ID(가까운 순)입니다.
    basis: number[]
    surface: 'brick' | 'plaster' | 'panel' | 'wood'
    ground: 'house' | 'window' | 'shutter'
    windowRows: number
    awning?: number
    frontRoad: StreetPoint[]
  }
  // 지붕 마감: 'sheet'는 칠한 금속 골판 지붕, 'concrete'는 평평한 슬래브 지붕(일반형 지붕 팔레트에서 고름)
  roofFinish?: 'sheet' | 'concrete'
  sharedEdges?: number[]
}

type Footprint = { type: string; properties: {
  id: number; height?: string; levels?: string; roofShape?: string
}; geometry: { type: string; coordinates: number[][][] } }

// OSM measurements take precedence over the district-wide massing estimate.
// Missing or malformed tags leave the photographed/area-based fallbacks intact.
export function osmMassing(properties: Pick<Footprint['properties'], 'height' | 'levels' | 'roofShape'>) {
  const height = properties.height?.trim().match(/^(\d+(?:\.\d+)?)\s*(?:m|meters?)?$/i)
  const measuredHeight = height ? Number(height[1]) : undefined
  const levels = properties.levels?.trim().match(/^\d+(?:\.\d+)?$/)
  const measuredLevels = levels ? Number(levels[0]) : undefined
  const roofShape = properties.roofShape?.toLowerCase()
  return {
    heightMeters: measuredHeight && measuredHeight >= 2 && measuredHeight <= 100
      ? measuredHeight : measuredLevels && measuredLevels >= 1 && measuredLevels <= 30
        ? measuredLevels * 2.65 + 0.8 : undefined,
    roofStyle: roofShape === 'flat' ? 'flat' as const
      : roofShape === 'gabled' || roofShape === 'gable' ? 'gable' as const : undefined,
  }
}

// 작가님 공방(꿈꾸는작업실, 옥천로101번길 23). 카카오 장소 좌표가 OSM 1468590644에 붙어 있지만, 이 윤곽은
// 골목을 따라 9.5m×2.2m 띠로 그려져 있습니다. 장소 로드뷰(pano 1202733209)에서 공방은 골목 쪽 면이 통창 세 칸과
// 벽돌 끝까지 약 4m, 갈림길 쪽 면이 통창 한 칸과 문까지 약 3.7m이고, 그 뒤로 골목을 따라 흰 벽 건물이 이어집니다.
// 골목 쪽 모서리와 벽 방향은 OSM 그대로 두고, 공방은 서쪽 끝 4m×3.7m로, 띠의 나머지는 별도 부속 건물로 나눕니다.
export const ARTIST_WORKSHOP_FOOTPRINT_ID = 1468590644
export const ARTIST_WORKSHOP_ANNEX_ID = 14685906441 // OSM에 없는 분할 윤곽이라 원 ID 뒤에 1을 붙였습니다.
export const ARTIST_WORKSHOP_SIZE = { laneFace: 4, frontFace: 3.7 }

function splitWorkshopFootprint(feature: Footprint): Footprint[] {
  // OSM 꼭짓점 순서: 0 남동, 1 남서, 2 북서(골목·갈림길 모서리), 3 북동
  const [southEast, southWest, northWest, northEast] = feature.geometry.coordinates[0].slice(0, 4)
    .map((point) => streetMeters(point as StreetPoint))
  const laneLength = Math.hypot(northEast[0] - northWest[0], northEast[1] - northWest[1])
  const along: [number, number] = [(northEast[0] - northWest[0]) / laneLength, (northEast[1] - northWest[1]) / laneLength]
  // 골목 쪽 벽에서 건물 안쪽(남서쪽)으로 향하는 단위 벡터
  const sideLength = Math.hypot(southWest[0] - northWest[0], southWest[1] - northWest[1])
  const inward: [number, number] = [-along[1], along[0]]
  if (inward[0] * (southWest[0] - northWest[0]) + inward[1] * (southWest[1] - northWest[1]) < 0) {
    inward[0] *= -1
    inward[1] *= -1
  }
  const at = (s: number, t: number): [number, number] => [
    northWest[0] + along[0] * s + inward[0] * t, northWest[1] + along[1] * s + inward[1] * t,
  ]
  const { laneFace, frontFace } = ARTIST_WORKSHOP_SIZE
  const ring = (points: [number, number][]) => [...points, points[0]].map(streetPoint)
  const osmDepth = Math.min(sideLength, Math.hypot(southEast[0] - northEast[0], southEast[1] - northEast[1]))
  return [
    { ...feature, geometry: { type: 'Polygon', coordinates: [ring([at(0, 0), at(laneFace, 0), at(laneFace, frontFace), at(0, frontFace)])] } },
    { ...feature, properties: { id: ARTIST_WORKSHOP_ANNEX_ID }, geometry: { type: 'Polygon', coordinates: [ring([
      at(laneFace, 0), at(laneLength, 0), at(laneLength, osmDepth), at(laneFace, osmDepth),
    ])] } },
  ]
}

const footprints = (buildingFootprints as unknown as { features: Footprint[] }).features
  .flatMap((feature) => feature.properties.id === ARTIST_WORKSHOP_FOOTPRINT_ID ? splitWorkshopFootprint(feature) : [feature])
// 개별 지붕을 조사하지 않은 건물의 일반형 지붕 팔레트입니다. 산비탈 마을에 흔한 청색·청록·녹색 칠 금속 지붕과
// 회색 슬래브 지붕을 섞은 디자인 값이며, 항공사진 등 실제 건물별 자료에서 얻은 색이 아닙니다.
// 재질 수를 줄이려고 몇 가지 색만 쓰고, OSM 번호로 골라 건물마다 늘 같은 색이 되게 합니다.
const genericRoofs: { color: number; finish: 'sheet' | 'concrete'; weight: number }[] = [
  { color: 0x5593ad, finish: 'sheet', weight: 3 }, { color: 0x76abc1, finish: 'sheet', weight: 2 },
  { color: 0x63a6a8, finish: 'sheet', weight: 3 }, { color: 0x88bdbb, finish: 'sheet', weight: 1 },
  { color: 0x68a28e, finish: 'sheet', weight: 2 }, { color: 0x8bb5a1, finish: 'sheet', weight: 1 },
  { color: 0xb57768, finish: 'sheet', weight: 1 },
  { color: 0xa2aaa6, finish: 'concrete', weight: 3 }, { color: 0xbcc2b8, finish: 'concrete', weight: 3 },
  { color: 0x858f8a, finish: 'concrete', weight: 1 }, { color: 0xc8cdc2, finish: 'concrete', weight: 1 },
]
const genericRoofTotal = genericRoofs.reduce((sum, roof) => sum + roof.weight, 0)
export function genericRoof(id: number) {
  // 이웃한 OSM 번호가 같은 색으로 몰리지 않게 정수 해시로 섞습니다.
  let hash = Math.imul(id ^ (id >>> 16), 0x45d9f3b) >>> 0
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0
  let pick = (hash ^ (hash >>> 16)) % genericRoofTotal
  for (const roof of genericRoofs) {
    if (pick < roof.weight) return roof
    pick -= roof.weight
  }
  return genericRoofs[0]
}
const workshop = streetMeters([129.00930268855, 35.095522407839])

// Each photographed building is tied to one OSM footprint. Addresses 173,
// 175 and 176 were checked against address points; the neighboring restaurant
// and the two visual landmarks were matched from the street photographs.
const conceptByFootprint: Record<number, NonNullable<StreetBuilding['concept']>> = {
  1468551460: 'soup',
  1468590636: 'chinese',
  1468551459: 'mart',
  1468590634: 'handmade',
  1468551461: 'fofos',
}

// The footprint order was matched to the south-to-north walk-through. These
// facades are visible in the supplied footage; unseen sides and roofs remain
// approximate. Keep them explicit instead of deriving colours from OSM IDs.
const observedByFootprint: Record<number, Pick<StreetBuilding,
  'heightMeters' | 'wallColor' | 'roofColor' | 'accentColor' | 'roofStyle' | 'observed'>> = {
  1469906537: { heightMeters: 7.1, wallColor: 0x914d4d, roofColor: 0x8f9790, accentColor: 0x518e78, roofStyle: 'flat', observed: { frame: 1, surface: 'brick', ground: 'glass', awning: 0x5a9876, windowRows: 1, windowColumns: 2 } },
  1469906536: { heightMeters: 8.8, wallColor: 0x73bda3, roofColor: 0x78a9a4, accentColor: 0x4a897b, roofStyle: 'flat', observed: { frame: 2, surface: 'plaster', ground: 'glass', windowRows: 2 } },
  1469906539: { heightMeters: 6.8, wallColor: 0xb68f91, roofColor: 0x82aeb4, accentColor: 0x668d80, roofStyle: 'flat', observed: { frame: 2, surface: 'plaster', ground: 'shutter', awning: 0x4e7775, windowRows: 1 } },
  1469906535: { heightMeters: 7.2, wallColor: 0x86bda9, roofColor: 0x7eb5aa, accentColor: 0xe9e8da, roofStyle: 'flat', observed: { frame: 2, surface: 'plaster', ground: 'glass', windowRows: 1 } },
  1469906534: { heightMeters: 6.6, wallColor: 0x64bdb7, roofColor: 0x7cb8bd, accentColor: 0x3e7974, roofStyle: 'flat', observed: { frame: 3, surface: 'plaster', ground: 'glass', windowRows: 1 } },
  1469906543: { heightMeters: 7.0, wallColor: 0x79b8c1, roofColor: 0x70b6b7, accentColor: 0x397b78, roofStyle: 'flat', observed: { frame: 3, surface: 'panel', ground: 'glass', awning: 0x4f8e88, windowRows: 1 } },
  1469906519: { heightMeters: 8.9, wallColor: 0x8d4d4e, roofColor: 0x798d8d, accentColor: 0xddd4c4, roofStyle: 'flat', observed: { frame: 3, surface: 'brick', ground: 'glass', windowRows: 2, windowColumns: 2 } },
  1469906544: { heightMeters: 6.7, wallColor: 0x69afc5, roofColor: 0x6ba8bd, accentColor: 0xb94365, roofStyle: 'flat', observed: { frame: 3, surface: 'panel', ground: 'glass', awning: 0xb54362, windowRows: 1 } },
  1469906545: { heightMeters: 6.9, wallColor: 0x83b6c4, roofColor: 0x64a6b9, accentColor: 0x547c79, roofStyle: 'flat', observed: { frame: 4, surface: 'panel', ground: 'shutter', awning: 0x548b83, windowRows: 1 } },
  1469906518: { heightMeters: 6.8, wallColor: 0x5dbab4, roofColor: 0x83bcb7, accentColor: 0xe7e9dc, roofStyle: 'flat', observed: { frame: 4, surface: 'plaster', ground: 'glass', windowRows: 1 } },
  1469906517: { heightMeters: 8.5, wallColor: 0x99615c, roofColor: 0x82928f, accentColor: 0xe9dfd0, roofStyle: 'flat', observed: { frame: 4, surface: 'brick', ground: 'glass', windowRows: 2, windowColumns: 2 } },
  1469906546: { heightMeters: 6.5, wallColor: 0xc7d0c9, roofColor: 0x83afb9, accentColor: 0x667976, roofStyle: 'flat', observed: { frame: 4, surface: 'plaster', ground: 'shutter', windowRows: 1 } },
  1469906549: { heightMeters: 6.8, wallColor: 0xbec3bb, roofColor: 0x829eaa, accentColor: 0x617880, roofStyle: 'flat', observed: { frame: 5, surface: 'plaster', ground: 'shutter', windowRows: 1 } },
  1468590690: { heightMeters: 6.9, wallColor: 0xe5e7df, roofColor: 0xa1aaa4, accentColor: 0xd2d7cd, roofStyle: 'flat', observed: { frame: 5, surface: 'plaster', ground: 'house', windowRows: 1 } },
  1468590691: { heightMeters: 7.0, wallColor: 0xcbbfaf, roofColor: 0x83abb5, accentColor: 0x947e68, roofStyle: 'flat', observed: { frame: 5, surface: 'plaster', ground: 'glass', awning: 0x897c6f, windowRows: 1 } },
  1468590687: { heightMeters: 6.8, wallColor: 0xe2e6dc, roofColor: 0xa6aea4, accentColor: 0xe8c847, roofStyle: 'flat', observed: { frame: 6, surface: 'panel', ground: 'glass', awning: 0xe9c83e, windowRows: 1 } },
  1468590693: { heightMeters: 8.5, wallColor: 0xc7b6a4, roofColor: 0x82abb4, accentColor: 0x765c52, roofStyle: 'flat', observed: { frame: 6, surface: 'plaster', ground: 'shutter', windowRows: 2 } },
  1468590685: { heightMeters: 7.2, wallColor: 0x9a674c, roofColor: 0x7a8a84, accentColor: 0xb87f53, roofStyle: 'flat', observed: { frame: 7, surface: 'wood', ground: 'glass', awning: 0xa9754f, windowRows: 1, windowColumns: 2 } },
  1468590694: { heightMeters: 6.7, wallColor: 0x93b9c5, roofColor: 0x6b9cae, accentColor: 0x567c87, roofStyle: 'flat', observed: { frame: 7, surface: 'panel', ground: 'shutter', windowRows: 1 } },
}

// Kakao roadview, November 2025: the lane above the workshop shows a low white
// building with a teal canopy on the west, a red-brick facade with a pale
// ground floor on the east, then more brick and ochre facades uphill. OSM road
// 165455065 separates these footprints and anchors their street-facing walls.
const northLaneRoad = mapSurfaces.roads.find((road) => road.id === 165455065)!.points as StreetPoint[]
// 촬영 거리 서쪽에서 남쪽으로 내려가는 도로(로드뷰 촬영됨). 이 도로 동쪽 건물들의 정면 기준입니다.
const southwestLaneRoad = mapSurfaces.roads.find((road) => road.id === 760588498)!.points as StreetPoint[]
// 감천문화마을 중심 거리(북서쪽 도로). 관광 상점과 어린왕자 포토존이 있는 구간입니다.
const villageMainRoad = mapSurfaces.roads.find((road) => road.id === 165455062)!.points as StreetPoint[]
const roadviewByFootprint: Record<number, Pick<StreetBuilding,
  'heightMeters' | 'wallColor' | 'roofColor' | 'accentColor' | 'roofStyle' | 'roadview'>> = {
  // 옥탑방: 감내1로175번길 68-4 주소점과 윤곽 중심 약 0.25m.
  // 적갈색 벽돌, 흰 창살, 연녹색 문, 발코니를 확인. 옥상·후면은 미확인.
  1468485967: {
    heightMeters: 8.6, wallColor: 0xb07b61, roofColor: 0x9da59a,
    accentColor: 0xe1e3d8, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'high', surface: 'brick',
      ground: 'house', windowRows: 2, windowColumns: 2, frontRoad: northLaneRoad,
      balcony: true, doorColor: 0xd6e8a2, parapetColor: 0xacaea4,
      bands: [{ height: 0.45, color: 0x53b8a2, thickness: 0.10 },
        { height: 0.70, color: 0xddd9cd, thickness: 0.08 }],
      openings: [
        { offsetFraction: -0.25, centerY: 1.9, width: 1.45, height: 1.6, kind: 'window', bars: true },
        { offsetFraction: 0.05, centerY: 1.25, width: 0.9, height: 2.4, kind: 'door' },
        { offsetFraction: 0.30, centerY: 1.25, width: 0.95, height: 2.4, kind: 'door' },
        { offsetFraction: -0.22, centerY: 4.55, width: 1.95, height: 1.6, kind: 'window' },
        { offsetFraction: 0.24, centerY: 4.55, width: 1.95, height: 1.6, kind: 'window' },
        { offsetFraction: -0.22, centerY: 7.25, width: 1.6, height: 1.4, kind: 'window' },
        { offsetFraction: 0.24, centerY: 7.25, width: 1.6, height: 1.4, kind: 'window' },
      ] },
  },
  // 제2안내소: 청록 테라스 북쪽의 작은 흰 박공 건물. 항공 대응은 중간 신뢰도.
  1468352669: {
    heightMeters: 3.3, wallColor: 0xeceee6, roofColor: 0xb65c3c,
    accentColor: 0x398f93, roofStyle: 'gable',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'plaster',
      ground: 'house', windowRows: 0, frontRoad: northLaneRoad,
      lowerWallColor: 0x398f93, lowerWallHeight: 0.85,
      doorColor: 0x368c8f, parapetColor: 0xe8e9e0, roofColorVerified: true,
      sign: { text: '제2안내소', color: 0xeceee6, ink: 0x343d36, centerY: 2.94, widthFraction: 0.65, panelHeight: 0.32 },
      openings: [
        { offsetFraction: -0.22, centerY: 1.43, width: 0.9, height: 2.35, kind: 'window' },
        { offsetFraction: 0.22, centerY: 1.23, width: 0.9, height: 2.25, kind: 'door' },
      ] },
  },
  // 259/261 분홍 주택 남쪽의 높은 청색 주택. 항공 윤곽·인접 순서 대응은 중간 신뢰도.
  // 주소 표식이 여러 저장 윤곽에 걸쳐 있어 이 건물의 주소는 확정하지 않습니다.
  1468590570: {
    heightMeters: 11.8, wallColor: 0xa9cbdc, roofColor: 0xbccacb,
    accentColor: 0xdce5e7, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'plaster',
      ground: 'house', windowRows: 3, windowColumns: 2, frontRoad: northLaneRoad,
      lowerWallColor: 0xcbd4cf, lowerWallHeight: 0.7,
      doorColor: 0x5c6564, parapetColor: 0xadc7d0, drainpipe: true,
      bands: [{ height: 8.78, color: 0x859fab, thickness: 0.12 }],
      openings: [
        { offsetFraction: -0.29, centerY: 4.0, width: 1.1, height: 1.6, kind: 'window' },
        { offsetFraction: 0.05, centerY: 4.0, width: 1.3, height: 1.65, kind: 'window' },
        { offsetFraction: 0.34, centerY: 4.0, width: 0.85, height: 1.05, kind: 'window' },
        { offsetFraction: -0.29, centerY: 6.95, width: 1.15, height: 1.4, kind: 'window' },
        { offsetFraction: 0.05, centerY: 7.05, width: 1.65, height: 1.25, kind: 'window' },
        { offsetFraction: 0.34, centerY: 7.05, width: 0.85, height: 1.2, kind: 'window' },
        { offsetFraction: -0.29, centerY: 10.0, width: 1.15, height: 1.35, kind: 'window', bars: true },
        { offsetFraction: 0.04, centerY: 10.0, width: 2.1, height: 1.45, kind: 'window' },
        { offsetFraction: 0.36, centerY: 10.0, width: 0.65, height: 1.0, kind: 'window' },
      ] },
  },
  // 감내1로 260 주소 위치와 도로 아래 청록 테라스 주택. 부속채 경계는 미확정.
  1468352670: {
    heightMeters: 5.7, wallColor: 0x19b6c3, roofColor: 0xbacac4,
    accentColor: 0xd1dfdc, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'plaster',
      ground: 'house', windowRows: 1, windowColumns: 2, frontRoad: northLaneRoad,
      roofRailing: true, parapetColor: 0x19b6c3,
      doorColor: 0x7e9691, lowerWallColor: 0x169ba9, lowerWallHeight: 2.7,
      bands: [{ height: 2.82, color: 0x59c8d0, thickness: 0.13 }],
      openings: [
        { offsetFraction: -0.25, centerY: 1.7, width: 1.05, height: 1.15, kind: 'window', bars: true },
        { offsetFraction: 0.24, centerY: 1.2, width: 0.85, height: 2.15, kind: 'door' },
      ] },
  },
  // 감내1로 259: 주소 표식과 항공 윤곽 중심 약 1.1m. 주차장 위 분홍 단층 주택.
  // 도로 아래 옹벽과 지형 높이는 별도 미측량; 후면과 지붕 경사는 추정.
  1468277215: {
    heightMeters: 3.5, wallColor: 0xcd8e96, roofColor: 0x70534c,
    accentColor: 0xe1dfd7, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'high', surface: 'plaster',
      ground: 'house', windowRows: 0, frontRoad: northLaneRoad,
      lowerWallColor: 0x696157, lowerWallHeight: 0.65,
      doorColor: 0x656e69, parapetColor: 0x70534c,
      bands: [{ height: 3.34, color: 0x70534c, thickness: 0.18 }],
      openings: [
        { offsetFraction: -0.27, centerY: 1.96, width: 1.1, height: 1.55, kind: 'window' },
        { offsetFraction: 0.23, centerY: 1.94, width: 1.1, height: 1.4, kind: 'window', bars: true },
      ] },
  },
  // 감내1로 257: 주소 표식은 항공사진 윤곽 중심과 약 1m 차이.
  // 로드뷰 주차장 너머의 두 층 벽돌 주택. 옹벽 높이와 후면은 미확인.
  1468277211: {
    heightMeters: 6.5, wallColor: 0x9c645b, roofColor: 0xa2aaa6,
    accentColor: 0xd9e6df, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'high', surface: 'brick',
      ground: 'house', windowRows: 1, frontRoad: northLaneRoad,
      doorColor: 0xa8afad, parapetColor: 0x88bdbb,
      bands: [{ height: 6.22, color: 0x88bdbb, thickness: 0.28 }],
      openings: [
        { offsetFraction: -0.3, centerY: 1.7, width: 1.55, height: 1.2, kind: 'window' },
        { offsetFraction: -0.03, centerY: 1.2, width: 0.9, height: 2.25, kind: 'door' },
        { offsetFraction: 0.29, centerY: 1.65, width: 2.25, height: 1.15, kind: 'window', bars: true },
        { offsetFraction: -0.48, centerY: 4.6, width: 0.35, height: 0.7, kind: 'window' },
        { offsetFraction: -0.23, centerY: 4.55, width: 1.3, height: 1.05, kind: 'window' },
        { offsetFraction: 0.27, centerY: 4.55, width: 1.9, height: 1.05, kind: 'window' },
      ] },
  },
  1468352691: {
    heightMeters: 6.7, wallColor: 0xd7e4db, roofColor: 0xbcc2b8,
    accentColor: 0xd6a6b6, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'high', surface: 'panel',
      ground: 'house', windowRows: 1, frontRoad: northLaneRoad,
      bands: [{ height: 2.9, color: 0xd6a6b6, thickness: 0.18 }],
      openings: [
        { offsetFraction: -0.34, centerY: 1.65, width: 1.1, height: 0.95, kind: 'window' },
        { offsetFraction: -0.03, centerY: 1.65, width: 1.65, height: 1.2, kind: 'window', bars: true },
        { offsetFraction: 0.33, centerY: 1.15, width: 0.85, height: 2.2, kind: 'door' },
        { offsetFraction: -0.28, centerY: 4.7, width: 1.15, height: 1.05, kind: 'window' },
        { offsetFraction: 0.27, centerY: 4.7, width: 1.15, height: 1.05, kind: 'window' },
      ] },
  },
  // Adjacent to 237 in both aerial geometry and roadview. Address unconfirmed.
  1468352690: {
    heightMeters: 6.9, wallColor: 0xd5b779, roofColor: 0xbcc2b8,
    accentColor: 0xe4e2d2, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'plaster',
      ground: 'window', windowRows: 1, windowColumns: 2, upperWindowWidth: 2.1,
      frontRoad: northLaneRoad, lowerWallColor: 0xbcb7a5, lowerWallHeight: 3.1,
      tileGrid: true, roofRailing: true,
      openings: [
        { offsetFraction: -0.27, centerY: 2.1, width: 1.5, height: 0.5, kind: 'window' },
        { offsetFraction: 0.25, centerY: 2.1, width: 1.5, height: 0.5, kind: 'window' },
        { offsetFraction: -0.23, centerY: 4.8, width: 2.1, height: 1.55, kind: 'window' },
        { offsetFraction: 0.24, centerY: 4.8, width: 2.1, height: 1.55, kind: 'window' },
      ] },
  },
  1468110784: {
    heightMeters: 4.2, wallColor: 0x665043, roofColor: 0x948268,
    accentColor: 0x303c38, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'high', surface: 'wood',
      ground: 'glass', windowRows: 0, frontRoad: northLaneRoad,
      sign: { text: 'Cafe', color: 0x44382f, ink: 0xf0ebe0, centerY: 3.47, widthFraction: 0.48 } },
  },
  1468352652: {
    heightMeters: 6.6, wallColor: 0x168ec1, roofColor: 0x5593ad,
    accentColor: 0x266779, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'plaster',
      ground: 'house', windowRows: 1, frontRoad: northLaneRoad,
      doorColor: 0xe8a5ac, roofRailing: true, cloudMural: true,
      bands: [{ height: 3.3, color: 0x237ba7, thickness: 0.18 }],
      openings: [
        { offsetFraction: 0.12, centerY: 1.2, width: 0.95, height: 2.2, kind: 'door' },
        { offsetFraction: 0.03, centerY: 4.7, width: 2.35, height: 1.55, kind: 'window' },
      ] },
  },
  1468277196: {
    heightMeters: 3.8, wallColor: 0xbcbabc, roofColor: 0x948268,
    accentColor: 0x54554c, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'panel',
      ground: 'house', windowRows: 0, frontRoad: northLaneRoad, tileGrid: true,
      doorColor: 0x756052,
      openings: [
        { offsetFraction: -0.3, centerY: 1.25, width: 0.95, height: 2.3, kind: 'door' },
        { offsetFraction: -0.01, centerY: 1.7, width: 1.15, height: 1.25, kind: 'window', bars: true },
        { offsetFraction: 0.3, centerY: 1.7, width: 1.15, height: 1.25, kind: 'window', bars: true },
      ] },
  },
  1468277197: {
    heightMeters: 7.1, wallColor: 0x70564f, roofColor: 0x858f8a,
    accentColor: 0xdfe5dc, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'brick',
      ground: 'house', windowRows: 1, windowColumns: 2, windowBars: true,
      upperWindowWidth: 2.1, barSpacing: 0.22, frontRoad: northLaneRoad,
      awning: 0x4f927d, doorColor: 0x676e67, baseColor: 0xdde1d8,
      openings: [
        { offsetFraction: -0.3, centerY: 1.3, width: 1.0, height: 2.4, kind: 'door', bars: true },
        { offsetFraction: 0.18, centerY: 1.7, width: 2.6, height: 1.55, kind: 'window', bars: true },
        { offsetFraction: -0.24, centerY: 4.8, width: 2.05, height: 1.5, kind: 'window' },
        { offsetFraction: 0.25, centerY: 4.8, width: 2.05, height: 1.5, kind: 'window' },
      ] },
  },
  1468277208: {
    heightMeters: 7.2, wallColor: 0xa56c5d, roofColor: 0xa2aaa6,
    accentColor: 0xe0e6dd, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'high', surface: 'brick',
      ground: 'house', windowRows: 1, windowColumns: 2, frontRoad: northLaneRoad,
      doorColor: 0x8d948a,
      openings: [
        { offsetFraction: -0.18, centerY: 1.7, width: 2.45, height: 1.6, kind: 'window' },
        { offsetFraction: 0.33, centerY: 1.2, width: 0.9, height: 2.25, kind: 'door', bars: true },
        { offsetFraction: -0.2, centerY: 4.8, width: 2.0, height: 1.4, kind: 'window' },
        { offsetFraction: 0.28, centerY: 4.8, width: 1.7, height: 1.4, kind: 'window' },
      ] },
  },
  1468277207: {
    heightMeters: 4.2, wallColor: 0xc4b7bb, roofColor: 0xa2aaa6,
    accentColor: 0xdde3dd, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'panel',
      ground: 'house', windowRows: 0, frontRoad: northLaneRoad,
      doorColor: 0xe1e5df,
      openings: [
        { offsetFraction: -0.14, centerY: 2.25, width: 2.8, height: 1.55, kind: 'window', bars: true },
        { offsetFraction: 0.34, centerY: 1.3, width: 0.85, height: 2.4, kind: 'door' },
      ] },
  },
  1468277209: {
    heightMeters: 6.7, wallColor: 0x8b5a4d, roofColor: 0xb57768,
    accentColor: 0xe0e6df, roofStyle: 'gable',
    roadview: { captured: '2025-11', matchConfidence: 'high', surface: 'brick',
      ground: 'window', windowRows: 1, frontRoad: northLaneRoad, roofColorVerified: true,
      bands: [{ height: 3.7, color: 0x46aead, thickness: 0.28 }], balcony: true,
      openings: [
        { offsetFraction: -0.28, centerY: 1.6, width: 2.0, height: 1.3, kind: 'window', bars: true },
        { offsetFraction: 0.27, centerY: 1.6, width: 2.0, height: 1.3, kind: 'window', bars: true },
        { offsetFraction: 0, centerY: 5.1, width: 5.2, height: 1.8, kind: 'window' },
      ] },
  },
  // The tall grey tiled facade between the panel house and the red-roof house
  // is visible in the same panorama. No independent address is asserted.
  1468277210: {
    heightMeters: 9.2, wallColor: 0xc4c9c5, roofColor: 0xa2aaa6,
    accentColor: 0xdce4da, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'panel',
      ground: 'window', windowRows: 2, windowColumns: 2,
      groundWindowColumns: 2, groundWindowWidth: 1.7, upperWindowWidth: 1.7,
      windowStartHeight: 4.75, windowBars: true, barSpacing: 0.2,
      tileGrid: true, frontRoad: northLaneRoad,
      bands: [{ height: 0.7, color: 0xad7567, thickness: 0.18 }] },
  },
  1468352676: {
    heightMeters: 7.7, wallColor: 0x97554b, roofColor: 0x858f8a,
    accentColor: 0xe1ded4, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'brick',
      ground: 'window', windowRows: 1, windowColumns: 2, windowBars: true,
      frontRoad: northLaneRoad, lowerWallColor: 0xce919a, lowerWallHeight: 1.6,
      bands: [{ height: 3.3, color: 0x6c9a86, thickness: 0.18 }] },
  },
  1468352662: {
    heightMeters: 6.8, wallColor: 0xdcb8c2, roofColor: 0x76abc1,
    accentColor: 0x7faf9f, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'plaster',
      ground: 'house', windowRows: 1, windowColumns: 1, frontRoad: northLaneRoad,
      doorColor: 0xb6c9c2, balcony: true,
      bands: [{ height: 3.15, color: 0x79b4a2, thickness: 0.22 },
        { height: 6.48, color: 0x79b4a2, thickness: 0.2 }] },
  },
  1468110796: {
    heightMeters: 3.9, wallColor: 0xb7d39c, roofColor: 0x5593ad,
    accentColor: 0x688d7c, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'high', surface: 'plaster',
      ground: 'house', windowRows: 0, windowBars: true, groundWindowWidth: 3.6,
      frontRoad: northLaneRoad, doorColor: 0x9eae96,
      bands: [{ height: 3.3, color: 0x4c8faa, thickness: 0.17 }] },
  },
  1468352689: {
    heightMeters: 7.7, wallColor: 0xdcd9c4, roofColor: 0xbcc2b8,
    accentColor: 0xdce0d7, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'high', surface: 'plaster',
      ground: 'window', windowRows: 1, windowColumns: 3, windowBars: true,
      frontRoad: northLaneRoad.filter(point => point[1] >= 35.09777 && point[1] <= 35.09797),
      groundWindowWidth: 2.6, groundWindowColumns: 3,
      windowStartHeight: 5.25, upperWindowWidth: 2.6, windowSpacing: 3.8, barSpacing: 0.22,
      parapetColor: 0xe4e1d3,
      sign: { text: '우리누리 지역아동센터', color: 0xbd3255, ink: 0xfff0b4,
        offsetFraction: -0.27, widthFraction: 0.36, centerY: 3.75, panelHeight: 1.3 } },
  },
  // Address search pins and the stored OSM footprints were matched independently.
  // Heights are estimates; roadview only verifies the street-facing exterior.
  1468590613: {
    heightMeters: 4.7, wallColor: 0xe5e8e4, roofColor: 0xa2aaa6,
    accentColor: 0x526b89, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'high', surface: 'panel',
      ground: 'shutter-glass', awning: 0x477bb0, drainpipe: true, windowRows: 0, frontRoad: northLaneRoad },
  },
  1468590605: {
    heightMeters: 12.0, wallColor: 0xdde0dd, roofColor: 0xa2aaa6,
    accentColor: 0xcbd0cc, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'high', surface: 'panel',
      ground: 'house', windowRows: 3, windowColumns: 6, frontRoad: northLaneRoad,
      lowerWallColor: 0xd1b8b3, lowerWallHeight: 5.9, tileGrid: true,
      doorColor: 0xc4cbca, groundWindowWidth: 3.2 },
  },
  1468485969: {
    heightMeters: 6.5, wallColor: 0xb2c4ce, roofColor: 0xa2aaa6,
    accentColor: 0xddd9c7, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'high', surface: 'panel',
      ground: 'glass', windowRows: 1, windowColumns: 2, frontRoad: northLaneRoad,
      tileGrid: true, baseColor: 0x649a83,
      bands: [{ height: 3.6, color: 0xc38a4b, thickness: 0.22 },
        { height: 6.16, color: 0xc38a4b, thickness: 0.18 }],
      sign: { text: '부산유리', color: 0x174d93, ink: 0xffe4a3 } },
  },
  1468551458: {
    heightMeters: 4.2, wallColor: 0xe8e7df, roofColor: 0xb57258,
    accentColor: 0x559d9a, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'high', surface: 'plaster', ground: 'house', awning: 0x56b4ad,
      awningProfile: 'curved', groundWindowWidth: 3.3,
      windowRows: 0, frontRoad: northLaneRoad, doorColor: 0xc6a8b9, parapetColor: 0xd9d9cf },
  },
  1468590619: {
    heightMeters: 8.1, wallColor: 0x8e5141, roofColor: 0x8c5c53,
    accentColor: 0xe0d7c8, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'high', surface: 'brick', ground: 'shutter-glass', windowRows: 1,
      frontRoad: northLaneRoad, lowerWallColor: 0xdedfd8, windowColumns: 2, windowBars: true },
  },
  1468551456: {
    heightMeters: 8.0, wallColor: 0xa45136, roofColor: 0xa27363,
    accentColor: 0xe8d5b9, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'high', surface: 'brick', ground: 'window', windowRows: 1, frontRoad: northLaneRoad,
      baseColor: 0xbbb9af, stoneBaseHeight: 0.95, windowColumns: 3, balcony: true, parapetColor: 0x916f5e },
  },
  1468590614: {
    heightMeters: 8.0, wallColor: 0xc8a438, roofColor: 0x8b9388,
    accentColor: 0x4d665f, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'high', surface: 'plaster', ground: 'house', windowRows: 1, frontRoad: northLaneRoad,
      baseColor: 0x6289a4, stoneBaseHeight: 0.9, windowColumns: 2, balcony: true, parapetColor: 0xb89c59 },
  },
  // Beyond the ochre house, roadview shows a pale two-storey building above
  // the rough stone retaining wall. Its side and exact ground-floor opening
  // are obscured, so only the visible road-facing treatment is represented.
  1468590615: {
    heightMeters: 7.8, wallColor: 0xe1e6d8, roofColor: 0xa5aaa2,
    accentColor: 0x5c6d67, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'plaster', ground: 'window', windowRows: 1,
      frontRoad: northLaneRoad, baseColor: 0x69746c, stoneBaseHeight: 1.15,
      windowColumns: 2, balcony: true, parapetColor: 0xc5cabb },
  },
  // Farther uphill the pale mint building with a shutter and outside stair
  // stands across from the long cream-tile block with blue horizontal bands.
  1468590612: {
    heightMeters: 7.7, wallColor: 0xd9dfcf, roofColor: 0x9fa49d,
    accentColor: 0x6c7b78, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'high', surface: 'plaster', ground: 'shutter', windowRows: 1,
      frontRoad: northLaneRoad, baseColor: 0x6d756d, stoneBaseHeight: 0.75,
      windowColumns: 3, windowBars: true, parapetColor: 0xb6bdb1 },
  },
  1468551455: {
    heightMeters: 9.6, wallColor: 0xe4d9c6, roofColor: 0xb5b5aa,
    accentColor: 0x7997a4, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'panel', ground: 'window', windowRows: 2,
      frontRoad: northLaneRoad, baseColor: 0x9eb5bc, windowColumns: 3, windowBars: true,
      parapetColor: 0xddd5c9 },
  },
  1468551454: {
    heightMeters: 9.5, wallColor: 0xe3d8c4, roofColor: 0xb4b6af,
    accentColor: 0x7897a6, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'panel', ground: 'window', windowRows: 2,
      frontRoad: northLaneRoad, baseColor: 0x9eb5bc, windowColumns: 2, windowBars: true,
      parapetColor: 0xddd5c9 },
  },
  1468551453: {
    heightMeters: 9.5, wallColor: 0xe3d9c8, roofColor: 0xb6b7ae,
    accentColor: 0x7797a2, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'panel', ground: 'window', windowRows: 2,
      frontRoad: northLaneRoad, baseColor: 0x9eb5bc, windowColumns: 2, windowBars: true,
      parapetColor: 0xddd5c9 },
  },
  // 2026-09-30 공방 주변 추가 대조. 카카오맵 2025년 11월 로드뷰에서 도로 쪽 면만 확인했다.
  // 예루살렘성교회: 도로 높이에서 한 층으로 보이는 긴 적벽돌 건물. 경사진 벽돌 처마에 어두운
  // 지그재그 무늬, 가로로 긴 창 띠, 회청색 셔터 출입구. 북쪽 끝은 두 층과 옥상 십자가.
  1468551457: {
    heightMeters: 4.4, wallColor: 0x9a4f3c, roofColor: 0xa2aaa6,
    accentColor: 0x6d3a2e, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'brick',
      ground: 'window', windowRows: 0, frontRoad: northLaneRoad,
      doorColor: 0x86a3a1, parapetColor: 0x7c3d2f,
      bands: [{ height: 3.7, color: 0x6d3a2e, thickness: 0.42 }],
      openings: [
        { offsetFraction: -0.36, centerY: 1.75, width: 4.6, height: 1.0, kind: 'window' },
        { offsetFraction: -0.16, centerY: 1.75, width: 3.2, height: 1.0, kind: 'window' },
        { offsetFraction: 0.02, centerY: 1.25, width: 2.6, height: 2.35, kind: 'door' },
        { offsetFraction: 0.12, centerY: 1.25, width: 1.0, height: 2.2, kind: 'door' },
        { offsetFraction: 0.3, centerY: 1.75, width: 4.2, height: 1.0, kind: 'window' },
      ] },
  },
  // DUF COFFEE: 흰 미장의 낮은 카페. 정면 가득 붙은 메모·포스터, 어두운 나무 출입문.
  1468551348: {
    heightMeters: 3.6, wallColor: 0xe9e7df, roofColor: 0xa2aaa6,
    accentColor: 0x3d352e, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'plaster',
      ground: 'house', windowRows: 0, frontRoad: northLaneRoad,
      doorColor: 0x3d352e, parapetColor: 0xdedbd2,
      sign: { text: 'DUF COFFEE', color: 0xf1efe8, ink: 0x3a3430, centerY: 2.95, widthFraction: 0.8, panelHeight: 0.55 } },
  },
  // 주소판 66. 1층은 흰 칠 벽돌에 나무틀 유리 출입문 두 개, 2층부터 적벽돌과 큰 창.
  1468590688: {
    heightMeters: 8.4, wallColor: 0x94503f, roofColor: 0xa2aaa6,
    accentColor: 0xe8e8e2, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'brick',
      ground: 'glass', windowRows: 2, windowColumns: 3, upperWindowWidth: 1.9,
      frontRoad: northLaneRoad, lowerWallColor: 0xeceeea, lowerWallHeight: 3.2,
      bands: [{ height: 3.25, color: 0xf2f2ee, thickness: 0.2 }] },
  },
  // 선명한 청록색 칠 벽돌 2층 주택. 흰 장식 문 두 개, 창살 창, 짙은 회색 타일 기단.
  1469906501: {
    heightMeters: 6.6, wallColor: 0x2fc2ad, roofColor: 0xa2aaa6,
    accentColor: 0xe7e9e4, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'high', surface: 'brick',
      ground: 'house', windowRows: 1, windowColumns: 1, windowBars: true,
      frontRoad: northLaneRoad, doorColor: 0xe3e4df,
      baseColor: 0x5b5d63, stoneBaseHeight: 0.55 },
  },
  // 주소판 157과 그 남쪽 이웃 건물이 한 저장 윤곽에 들어 있다. 짙은 적벽돌, 창살 창과 문,
  // 남쪽 절반은 회색 롤셔터 두 칸과 위층 작은 철제 발코니.
  1469906598: {
    heightMeters: 7.4, wallColor: 0x7e3f35, roofColor: 0xa2aaa6,
    accentColor: 0xd9ddd6, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'brick',
      ground: 'house', windowRows: 1, frontRoad: northLaneRoad,
      doorColor: 0x2f3432, baseColor: 0xd6d7cf,
      openings: [
        { offsetFraction: -0.36, centerY: 1.15, width: 1.7, height: 2.2, kind: 'door' },
        { offsetFraction: -0.24, centerY: 1.15, width: 1.7, height: 2.2, kind: 'door' },
        { offsetFraction: -0.1, centerY: 1.2, width: 0.9, height: 2.3, kind: 'door', bars: true },
        { offsetFraction: 0.08, centerY: 1.2, width: 0.9, height: 2.3, kind: 'door', bars: true },
        { offsetFraction: 0.3, centerY: 1.7, width: 2.2, height: 1.3, kind: 'window', bars: true },
        { offsetFraction: -0.27, centerY: 4.6, width: 1.7, height: 1.2, kind: 'window' },
        { offsetFraction: 0.05, centerY: 4.9, width: 0.8, height: 0.7, kind: 'window' },
        { offsetFraction: 0.3, centerY: 4.8, width: 1.6, height: 1.2, kind: 'window' },
      ] },
  },
  // 주소판 210. 연두·노랑 미장 상점, 짙은 갈색 차양과 창살 창, 고양이 그림.
  1468485984: {
    heightMeters: 6.8, wallColor: 0xd5dc6a, roofColor: 0xa2aaa6,
    accentColor: 0x5a3f33, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'plaster',
      ground: 'glass', awning: 0x5a3f33, windowRows: 1, windowColumns: 1,
      upperWindowWidth: 1.8, frontRoad: northLaneRoad },
  },
  // 210 북쪽 계단 옆. 연한 살구·베이지 미장, 흰 난간이 달린 창, 위층 녹색 사이딩.
  1468485981: {
    heightMeters: 6.9, wallColor: 0xe6c7ad, roofColor: 0xa2aaa6,
    accentColor: 0x8fa590, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'plaster',
      ground: 'window', windowRows: 1, windowColumns: 1, windowBars: true,
      groundWindowWidth: 2.1, frontRoad: northLaneRoad, balcony: true,
      bands: [{ height: 3.4, color: 0xd9b89d, thickness: 0.22 }] },
  },
  // '현대연탄 가스' 간판 문 옆. 연분홍 베이지 미장의 단층, 두꺼운 콘크리트 처마.
  1468485990: {
    heightMeters: 3.4, wallColor: 0xe0cfc4, roofColor: 0xa2aaa6,
    accentColor: 0x9a9d99, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'plaster',
      ground: 'house', windowRows: 0, frontRoad: northLaneRoad,
      doorColor: 0x9ea3a0, parapetColor: 0xa9aca7,
      bands: [{ height: 3.05, color: 0xa9aca7, thickness: 0.3 }] },
  },
  // 주소판 216. 크림색 미장, 회색 알루미늄 유리 양문과 채광창, 창살 창, 콘크리트 처마.
  1468485974: {
    heightMeters: 6.3, wallColor: 0xe8e0c8, roofColor: 0xa2aaa6,
    accentColor: 0x6f625a, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'high', surface: 'plaster',
      ground: 'house', windowRows: 1, windowColumns: 1, upperWindowWidth: 1.2,
      frontRoad: northLaneRoad, doorColor: 0x8d9391, windowBars: true,
      openings: [
        { offsetFraction: -0.18, centerY: 1.25, width: 2.0, height: 2.4, kind: 'door' },
        { offsetFraction: 0.18, centerY: 1.7, width: 1.3, height: 0.9, kind: 'window', bars: true },
        { offsetFraction: 0.2, centerY: 4.3, width: 1.1, height: 0.9, kind: 'window' },
      ] },
  },
  // 적갈색 벽돌, 흰 창살 창과 붉은 가스관, 기단의 청록·흰 포인트 타일, 위층 난간.
  1468485978: {
    heightMeters: 7.0, wallColor: 0x8a4a3c, roofColor: 0xa2aaa6,
    accentColor: 0x3fb3a3, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'brick',
      ground: 'window', windowRows: 1, windowColumns: 1, windowBars: true,
      groundWindowWidth: 1.8, frontRoad: northLaneRoad, balcony: true,
      bands: [{ height: 0.55, color: 0x3fb3a3, thickness: 0.12 }] },
  },
  // 작가님 공방(꿈꾸는작업실). 윤곽은 위 splitWorkshopFootprint로 보정하고, 외관은 거리 장면이
  // artistWorkshopModel.ts의 전용 모델로 그립니다(통창 돌출 칸, 양문과 계단참, 옥상 난간). 여기 값은
  // 대조 현황과 주변 추정 외관이 참고하는 재료·색입니다.
  1468590644: {
    heightMeters: 3.55, wallColor: 0xcdb7a0, roofColor: 0xc9c7bf,
    accentColor: 0x4b5559, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'high', surface: 'brick',
      ground: 'window', windowRows: 0, frontRoad: northLaneRoad, roofRailing: true,
      roofColorVerified: true, baseColor: 0x8f8d86, parapetColor: 0xd9d6cc, doorColor: 0xf1f2ee,
      openings: [] },
  },
  // 공방에서 골목을 따라 이어지는 크림색 미장 2층 건물(OSM 띠를 나눈 나머지). 같은 로드뷰에서 골목 쪽 벽,
  // 아래층의 좁은 세로창 두 개와 위층 창이 보인다. 지붕 모양은 공방 난간에 가려 평지붕으로 둔다.
  14685906441: {
    heightMeters: 6.2, wallColor: 0xe8e3d8, roofColor: 0xc9c9c2,
    accentColor: 0xd9d4c8, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'plaster',
      ground: 'house', windowRows: 0, frontRoad: northLaneRoad, baseColor: 0xcfc9bc,
      openings: [
        { offsetFraction: -0.22, centerY: 1.7, width: 0.42, height: 1.2, kind: 'window' },
        { offsetFraction: -0.08, centerY: 1.7, width: 0.42, height: 1.2, kind: 'window' },
        { offsetFraction: 0.12, centerY: 4.35, width: 1.1, height: 1.0, kind: 'window' },
      ] },
  },
  // 공방 서쪽 이웃(갈림길 모서리). 사진 시안에서 로드뷰 대조 모델로 바꿨다. 연어색 미장 2층, 붉은 금속
  // 모임지붕, 길(서·남서) 쪽 면에 위층 4칸 창과 작은 창, LG 실외기, 1층 유리 미닫이문과 튀어나온 칸의 창.
  1468590633: {
    heightMeters: 6.4, wallColor: 0xdf9f8a, roofColor: 0x8e3b2f,
    accentColor: 0xf1efe8, roofStyle: 'gable',
    roadview: { captured: '2025-11', matchConfidence: 'high', surface: 'plaster',
      ground: 'house', windowRows: 0, frontRoad: northLaneRoad, roofColorVerified: true,
      doorColor: 0xe4e8e2, baseColor: 0xd08f7c,
      bands: [{ height: 5.55, color: 0xd48f7b, thickness: 0.3 }],
      openings: [
        { offsetFraction: -0.33, centerY: 4.55, width: 0.55, height: 0.35, kind: 'window' },
        { offsetFraction: 0.12, centerY: 4.5, width: 2.6, height: 0.95, kind: 'window' },
        { offsetFraction: -0.04, centerY: 1.15, width: 1.5, height: 2.2, kind: 'door' },
        { offsetFraction: 0.32, centerY: 1.15, width: 1.1, height: 1.6, kind: 'window' },
        { offsetFraction: 0.33, centerY: 2.6, width: 0.75, height: 0.5, kind: 'window' },
      ] },
  },
  // 2026-09-30 두 번째 추가 대조: 남서쪽 도로 760588498 동쪽과 감내1로 210·220 부근.
  // 연녹색 칠 벽돌, 1·2층 모두 창살 창.
  1469906524: {
    heightMeters: 6.6, wallColor: 0xb7d39a, roofColor: 0xa2aaa6,
    accentColor: 0xe6e9e3, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'brick',
      ground: 'window', windowRows: 1, windowColumns: 1, windowBars: true,
      frontRoad: northLaneRoad, baseColor: 0x9fbf86 },
  },
  // 짙은 적벽돌(얼룩진 백화), 반지하 창과 1층 창 모두 창살.
  1469906525: {
    heightMeters: 6.8, wallColor: 0x6e3a31, roofColor: 0xa2aaa6,
    accentColor: 0xd7d9d2, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'brick',
      ground: 'window', windowRows: 1, windowColumns: 1, windowBars: true,
      groundWindowWidth: 1.7, upperWindowWidth: 1.9, frontRoad: southwestLaneRoad },
  },
  // 주소판 150. 짙은 적갈색 벽돌 2층, 1층은 회색 화강석 판과 방범 셔터 창 두 칸.
  1469906528: {
    heightMeters: 6.9, wallColor: 0x6f3d33, roofColor: 0xa2aaa6,
    accentColor: 0xa9aba6, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'high', surface: 'brick',
      ground: 'window', windowRows: 1, windowColumns: 2, windowBars: true,
      groundWindowColumns: 2, groundWindowWidth: 2.2, frontRoad: southwestLaneRoad,
      lowerWallColor: 0xb5b6b0, lowerWallHeight: 3.0, tileGrid: true,
      bands: [{ height: 3.05, color: 0xc2c3bd, thickness: 0.28 }] },
  },
  // 주황·적색이 섞인 벽돌, 창살 창과 검은 방범문, 위층 장식 창살.
  1469906529: {
    heightMeters: 6.8, wallColor: 0xa9573a, roofColor: 0xa2aaa6,
    accentColor: 0x2d2f2d, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'brick',
      ground: 'house', windowRows: 1, windowColumns: 2, windowBars: true,
      frontRoad: southwestLaneRoad, doorColor: 0x262927,
      openings: [
        { offsetFraction: -0.3, centerY: 1.6, width: 1.1, height: 1.2, kind: 'window', bars: true },
        { offsetFraction: 0.02, centerY: 1.6, width: 1.1, height: 1.2, kind: 'window', bars: true },
        { offsetFraction: 0.3, centerY: 1.15, width: 1.1, height: 2.3, kind: 'door', bars: true },
        { offsetFraction: -0.2, centerY: 4.6, width: 1.3, height: 1.1, kind: 'window', bars: true },
        { offsetFraction: 0.22, centerY: 4.6, width: 1.3, height: 1.1, kind: 'window', bars: true },
      ] },
  },
  // 210 남쪽. 벗겨진 연두색 미장, 앞쪽 낮은 부속채(창살 창)와 뒤쪽 3층 몸채의 작은 창 열.
  1468485985: {
    heightMeters: 9.0, wallColor: 0xe0e4a8, roofColor: 0xa2aaa6,
    accentColor: 0xc9d0b4, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'plaster',
      ground: 'window', windowRows: 2, windowColumns: 4, upperWindowWidth: 1.0,
      windowBars: true, frontRoad: northLaneRoad,
      lowerWallColor: 0xd3dbbf, lowerWallHeight: 3.3,
      bands: [{ height: 5.9, color: 0xeaecd0, thickness: 0.22 }] },
  },
  // 220번지 부근 동쪽. 물고기 그림이 붙은 거친 석축과 스테인리스 난간 위의 낡은 연민트 미장 주택.
  1468352683: {
    heightMeters: 7.6, wallColor: 0xcfe2d2, roofColor: 0xa2aaa6,
    accentColor: 0x6b5a4a, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'plaster',
      ground: 'house', windowRows: 1, windowColumns: 1, windowBars: true,
      frontRoad: northLaneRoad, baseColor: 0x6d6e68, stoneBaseHeight: 1.9,
      doorColor: 0x6b5a4a, roofRailing: true },
  },
  // 위 주택 남쪽의 연한 청회색 미장 건물. 석축 위에 있어 하부는 보이지 않는다.
  1468352684: {
    heightMeters: 7.4, wallColor: 0xb7c3cf, roofColor: 0xa2aaa6,
    accentColor: 0xe1e5e8, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'plaster',
      ground: 'window', windowRows: 1, windowColumns: 1,
      frontRoad: northLaneRoad, baseColor: 0x6d6e68, stoneBaseHeight: 1.9 },
  },
  // 감천문화마을 중심 거리. 파란 칠 벽돌 2층, 위층 큰 창 두 개, 1층은 엽서 가게(남색 차양)와
  // 분홍 차양의 휴대폰 케이스 가게가 나란히 있다.
  1467907462: {
    heightMeters: 7.2, wallColor: 0x4f8fd6, roofColor: 0xa2aaa6,
    accentColor: 0xd99aa6, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'brick',
      ground: 'glass', awning: 0xd99aa6, windowRows: 1, windowColumns: 2,
      upperWindowWidth: 2.4, frontRoad: villageMainRoad },
  },
  // 주소판 127. BUSAN BADA SAND HILLS 카페: 연보라 회색 타일 판, 파란 띠와 간판,
  // 1층 폴딩 유리창, 위층 유리 개방부와 검은 난간.
  1467907463: {
    heightMeters: 7.6, wallColor: 0xd6d3dc, roofColor: 0xa2aaa6,
    accentColor: 0x2f58b8, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'high', surface: 'panel',
      ground: 'glass', windowRows: 1, windowColumns: 2, upperWindowWidth: 3.0,
      tileGrid: true, balcony: true, frontRoad: villageMainRoad,
      bands: [{ height: 3.2, color: 0x2f58b8, thickness: 0.34 }],
      sign: { text: 'BUSAN BADA SAND HILLS', color: 0xe8e5ec, ink: 0x2d4fb0, centerY: 3.55, widthFraction: 0.7, panelHeight: 0.42 } },
  },
  // 뷰티풀 캣 캐리커쳐: 보라색 큰 간판과 차양, 크림색 위층 벽, 옥상 흰 난간.
  1467907509: {
    heightMeters: 6.4, wallColor: 0xf0e6c4, roofColor: 0xa2aaa6,
    accentColor: 0x8a5cc6, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'plaster',
      ground: 'glass', awning: 0x8a5cc6, windowRows: 0, frontRoad: villageMainRoad,
      roofRailing: true, parapetColor: 0xf4f3ee,
      sign: { text: '뷰티풀 캣 캐리커쳐', color: 0x8e5bc8, ink: 0xffffff, centerY: 3.75, widthFraction: 0.9, panelHeight: 0.9 } },
  },
  // 어린왕자 포토존 위 분홍 주택. 마을 벽화가 그려진 옹벽 위 테라스에 있는 단층, 붉은 틀 창과
  // 사람·고양이 그림. 옹벽 높이는 추정.
  1467910232: {
    heightMeters: 5.8, wallColor: 0xeb8fc0, roofColor: 0xa2aaa6,
    accentColor: 0xc8323c, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'high', surface: 'plaster',
      ground: 'house', windowRows: 0, frontRoad: villageMainRoad,
      baseColor: 0x3a5f9e, stoneBaseHeight: 2.2, doorColor: 0xc8323c,
      openings: [
        { offsetFraction: -0.25, centerY: 3.35, width: 0.9, height: 1.9, kind: 'door' },
        { offsetFraction: 0.08, centerY: 3.75, width: 2.6, height: 1.0, kind: 'window' },
      ] },
  },
  // 2026-09-30 세 번째 추가 대조: 감천문화마을 중심 거리의 나머지.
  // 거리 아래 주차장 쪽에서 본 면. 비눗방울 벽화가 그려진 흰 옹벽 위 크림색 미장 상점,
  // 짙은 나무 창틀. 상점 정면은 옹벽 위 거리 쪽이다.
  1467907430: {
    heightMeters: 6.2, wallColor: 0xece3cc, roofColor: 0xa2aaa6,
    accentColor: 0x5e4533, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'plaster',
      ground: 'window', windowRows: 0, groundWindowColumns: 2, groundWindowWidth: 1.2,
      frontRoad: villageMainRoad, baseColor: 0xefefea, stoneBaseHeight: 2.4,
      doorColor: 0x5e4533 },
  },
  // 적벽돌 2층 기념품 가게. 짙은 빨강 차양, 위층 검은 틀 폴딩창, 흰 장식 옆문.
  1468352626: {
    heightMeters: 6.9, wallColor: 0xa14a38, roofColor: 0xa2aaa6,
    accentColor: 0x9c2432, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'brick',
      ground: 'glass', awning: 0x9c2432, windowRows: 1, windowColumns: 2,
      upperWindowWidth: 1.5, frontRoad: villageMainRoad },
  },
  // 위 가게 서쪽의 분홍 벽과 흰 나무 사이딩 건물, 옥상 녹색 테라스 난간.
  1468352618: {
    heightMeters: 6.6, wallColor: 0xe6b7c4, roofColor: 0xa2aaa6,
    accentColor: 0x3f8f6e, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'wood',
      ground: 'house', windowRows: 1, windowColumns: 1, frontRoad: villageMainRoad,
      lowerWallColor: 0xf2f0ea, lowerWallHeight: 3.0, roofRailing: true,
      bands: [{ height: 3.1, color: 0x6fae5a, thickness: 0.16 }] },
  },
  // 갈색 싱글 박공지붕의 작은 목조 상점, 짙은 나무틀 유리창과 인조잔디 앞마당.
  1468352713: {
    heightMeters: 3.4, wallColor: 0x5a4234, roofColor: 0x7b5646,
    accentColor: 0x7b5646, roofStyle: 'gable',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'wood',
      ground: 'glass', windowRows: 0, frontRoad: villageMainRoad, roofColorVerified: true },
  },
  // 간식 가게: 빨간 차양과 삼각 깃발, 검은 간판 띠, 위층 어두운 틀 유리창 열, 아이스크림 조형물.
  1467910240: {
    heightMeters: 6.8, wallColor: 0x55595b, roofColor: 0xa2aaa6,
    accentColor: 0xd6333f, roofStyle: 'flat',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'panel',
      ground: 'glass', awning: 0xd6333f, windowRows: 1, windowColumns: 4,
      upperWindowWidth: 1.0, windowStartHeight: 4.6, frontRoad: villageMainRoad,
      bands: [{ height: 3.35, color: 0x222426, thickness: 0.55 }] },
  },
  // 어두운 박공 차양을 얹은 주스 가판점, FRESH JUICE 간판.
  1467910242: {
    heightMeters: 3.8, wallColor: 0xf0c34a, roofColor: 0x2c2d2e,
    accentColor: 0xe0452f, roofStyle: 'gable',
    roadview: { captured: '2025-11', matchConfidence: 'medium', surface: 'panel',
      ground: 'glass', awning: 0xe0452f, windowRows: 0, frontRoad: villageMainRoad,
      roofColorVerified: true,
      sign: { text: 'FRESH JUICE', color: 0x1e4fa3, ink: 0xffd83a, centerY: 3.0, widthFraction: 0.8, panelHeight: 0.45 } },
  },
}

// 로드뷰로 정면을 볼 수 없는 공방 주변 건물의 추정 외관입니다(사용자 요청: 주변과 비슷하게 추정).
// 가까운 확인 건물(로드뷰·영상) 중 하나의 벽 재료·색을 빌려 쓰며, 근거 건물 ID를 함께 남깁니다.
// 실제 외관을 확인한 결과가 아니므로 대조 현황에서는 별도 상태로 집계합니다.
// 개별 외관 근거가 없는 건물에 이웃 외벽을 복사하지 않습니다.
export const INFERRED_RADIUS_METERS = 0

const conceptAppearance: Record<NonNullable<StreetBuilding['concept']>, Pick<StreetBuilding,
  'heightMeters' | 'wallColor' | 'roofColor' | 'accentColor' | 'storefront' | 'shopfrontStyle' | 'roofStyle' | 'brickFacade'>> = {
  soup: { heightMeters: 9.1, wallColor: 0x8d5142, roofColor: 0x7f817d, accentColor: 0xe4d7b7, storefront: true, shopfrontStyle: 'glass', roofStyle: 'flat', brickFacade: true },
  chinese: { heightMeters: 9.0, wallColor: 0x9c5446, roofColor: 0x7e827e, accentColor: 0xb33239, storefront: true, shopfrontStyle: 'glass', roofStyle: 'flat', brickFacade: true },
  mart: { heightMeters: 9.2, wallColor: 0xaad12f, roofColor: 0x9bbd31, accentColor: 0x27699c, storefront: true, shopfrontStyle: 'glass', roofStyle: 'flat', brickFacade: false },
  handmade: { heightMeters: 6.6, wallColor: 0xecece4, roofColor: 0xc5cbc2, accentColor: 0x3b8063, storefront: true, shopfrontStyle: 'glass', roofStyle: 'flat', brickFacade: true },
  fofos: { heightMeters: 6.5, wallColor: 0x936c4c, roofColor: 0xe6e1d5, accentColor: 0xb37b52, storefront: true, shopfrontStyle: 'glass', roofStyle: 'flat', brickFacade: false },
  pink: { heightMeters: 6.6, wallColor: 0xd19c94, roofColor: 0x747a7c, accentColor: 0xe1beb1, storefront: false, shopfrontStyle: 'glass', roofStyle: 'gable', brickFacade: false },
}

// Unverified façades use restrained neutral materials instead of guessed
// address-specific colours.
const contextWalls = [0xd9d8d2, 0xe2dfd7, 0xcaccc7, 0xd5d2cc]

function polygonArea(points: [number, number][]) {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]
    return sum + point[0] * next[1] - next[0] * point[1]
  }, 0) / 2)
}

function pointSegmentDistance([x, z]: [number, number], [ax, az]: [number, number], [bx, bz]: [number, number]) {
  const dx = bx - ax
  const dz = bz - az
  const lengthSquared = dx * dx + dz * dz
  if (lengthSquared < 0.001) return Math.hypot(x - ax, z - az)
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSquared))
  return Math.hypot(x - ax - t * dx, z - az - t * dz)
}

// A pair of nearby long walls is usually a party wall, not a facade. Require
// agreement at several positions so a single touching corner stays exposed.
export function sharedBuildingEdges(outline: [number, number][], neighbors: [number, number][][]) {
  return outline.flatMap((a, index) => {
    const b = outline[(index + 1) % outline.length]
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 2) return []
    const samples = [0.25, 0.5, 0.75].map((t) => [
      a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t,
    ] as [number, number])
    const shared = neighbors.some((neighbor) => samples.filter((point) => neighbor.some((start, edge) =>
      pointSegmentDistance(point, start, neighbor[(edge + 1) % neighbor.length]) < 0.7)).length >= 2)
    return shared ? [index] : []
  })
}

// OSM 도로와 관리자가 확인한 골목길(recordedAlleys.ts)
const mapRoads = [...mapSurfaces.roads, ...RECORDED_ALLEY_WAYS]
const allRoads = (mapRoads as unknown as { points: StreetPoint[] }[]).map((road) => ({
  points: road.points, meters: road.points.map(streetMeters),
}))

function centerMeters(building: StreetBuilding): [number, number] {
  const meters = building.outline.map(streetMeters)
  return [meters.reduce((sum, [x]) => sum + x, 0) / meters.length, meters.reduce((sum, [, z]) => sum + z, 0) / meters.length]
}

function nearestRoadPoints(center: [number, number]) {
  let best = { distance: Infinity, points: allRoads[0]?.points ?? [] }
  for (const road of allRoads) for (let index = 0; index < road.meters.length - 1; index++) {
    const distance = pointSegmentDistance(center, road.meters[index], road.meters[index + 1])
    if (distance < best.distance) best = { distance, points: road.points }
  }
  return best.points
}

// 공방 주변에서 외관이 확인되지 않은 건물에 가장 가까운 확인 건물의 재료·색을 빌려 줍니다.
// 같은 근거 건물을 여러 이웃이 똑같이 복사하지 않도록 가까운 세 동 중에서 ID로 하나를 고릅니다.
function inferNearbyFacades(buildings: StreetBuilding[]) {
  const verified = buildings.filter((building) => building.roadview || building.observed)
    .map((building) => ({ building, center: centerMeters(building) }))
  if (!verified.length) return
  for (const building of buildings) {
    if (building.concept || building.roadview || building.observed || building.id === 1469906540) continue
    const center = centerMeters(building)
    if (Math.hypot(center[0] - workshop[0], center[1] - workshop[1]) > INFERRED_RADIUS_METERS) continue
    const basis = verified
      .map((candidate) => ({ ...candidate, distance: Math.hypot(candidate.center[0] - center[0], candidate.center[1] - center[1]) }))
      .sort((a, b) => a.distance - b.distance).slice(0, 3)
    const source = basis[building.id % basis.length].building
    const facade = source.roadview ?? source.observed!
    building.wallColor = source.wallColor
    building.accentColor = source.accentColor
    // 가까운 외벽만 상세 기하를 사용하고 먼 동네는 분할 로딩 모델을 유지합니다.
    building.detail = Math.hypot(center[0] - workshop[0], center[1] - workshop[1]) <= 80 ? 'featured' : 'context'
    building.inferred = {
      basis: basis.map((item) => item.building.id),
      surface: facade.surface,
      ground: facade.ground === 'window' || facade.ground === 'shutter' ? facade.ground : 'house',
      windowRows: building.heightMeters > 6 ? 1 : 0,
      frontRoad: nearestRoadPoints(center),
    }
  }
}

// 도로 침범 보정. OSM 건물 윤곽과 도로 중심선은 따로 그려져 있어, 거리 장면이 그리는 도로 폭(roadCorridors)과
// 겹치는 건물이 있습니다. 지도 자료에 그렇게 표기되어 있더라도 건물이 도로에 튀어나오지 않도록 윤곽에서 도로
// 부분을 잘라 냅니다.
//  - 차도: 차도 가장자리 아래로 보이는 돌 포장(roadOutlines의 sidewalk 여유)까지 깎습니다.
//  - 골목길(footway·path·steps): 가장자리 돌 테두리(ALLEY_EDGE)까지 깎습니다. 예전에는 건물 한가운데를 지나도록
//    그려진 길을 건너뛰었지만, 그런 건물은 대부분 작은 창고·부속 건물(36㎡ 이하)이라 이제 모두 깎습니다(2026-10-09).
// 겹치지 않는 건물은 원래 윤곽을 그대로 씁니다.
type Box = [minX: number, maxX: number, minZ: number, maxZ: number]
type RoadShape = { polygon: polygonClipping.Polygon; box: Box; foot: boolean; id?: number }
let carriageways: RoadShape[] | undefined
function carriagewayShapes() {
  if (carriageways) return carriageways
  const runs: { points: [number, number][]; width: number; type: string; gaps: [number, number][]; id?: number }[] =
    (mapRoads as unknown as { id?: number; type: string; width?: number; points: StreetPoint[] }[])
      .map((way) => ({ points: way.points.map(streetMeters), width: roadWidth(way), type: way.type, gaps: [], id: way.id }))
  runs.push({ points: PHOTOGRAPHED_STREET.map(streetMeters), width: PHOTOGRAPHED_ROAD_WIDTH, type: 'photographed', gaps: [] })
  const nudged = runs.map((run) => ({ ...run, points: clearRoadOfKeptBuildings(run.points, run.width) }))
  const shape = (foot: boolean, id?: number) => (polygon: polygonClipping.Polygon): RoadShape => ({ polygon, box: ringBox(polygon[0]), foot, id })
  carriageways = [
    ...roadOutlines(nudged.filter((run) => !FOOT_ROAD_TYPES.has(run.type)), true).map(shape(false)),
    // roadOutlines는 footway를 건너뛰므로 종류 이름만 바꿔 넘깁니다. 길 번호를 남기려고 길마다 따로 만듭니다.
    ...nudged.filter((run) => FOOT_ROAD_TYPES.has(run.type))
      .flatMap((run) => roadOutlines([{ ...run, type: 'foot', width: run.width + ALLEY_EDGE }]).map(shape(true, run.id))),
  ]
  return carriageways
}

function ringBox(ring: [number, number][]): Box {
  const xs = ring.map(([x]) => x), zs = ring.map(([, z]) => z)
  return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
}

// 원형 교차부를 잘라 낸 자리에 생기는 짧은 호를 곧은 벽으로 정리합니다(Douglas-Peucker, 허용 오차 4cm).
function simplifyPath(points: [number, number][], tolerance: number): [number, number][] {
  let farthest = -1, distance = tolerance
  for (let index = 1; index < points.length - 1; index++) {
    const current = pointSegmentDistance(points[index], points[0], points[points.length - 1])
    if (current > distance) { distance = current; farthest = index }
  }
  if (farthest < 0) return [points[0], points[points.length - 1]]
  return [...simplifyPath(points.slice(0, farthest + 1), tolerance).slice(0, -1), ...simplifyPath(points.slice(farthest), tolerance)]
}

function simplifyRing(ring: [number, number][], tolerance = 0.04): [number, number][] {
  // 닫힌 고리는 서로 가장 먼 두 꼭짓점에서 나눠 양쪽 경로를 단순화합니다.
  let first = 0, second = 0, widest = -1
  for (let a = 0; a < ring.length; a++) for (let b = a + 1; b < ring.length; b++) {
    const current = Math.hypot(ring[b][0] - ring[a][0], ring[b][1] - ring[a][1])
    if (current > widest) { widest = current; first = a; second = b }
  }
  const forward = simplifyPath(ring.slice(first, second + 1), tolerance)
  const back = simplifyPath([...ring.slice(second), ...ring.slice(0, first + 1)], tolerance)
  return [...forward.slice(0, -1), ...back.slice(0, -1)]
}

// 보정하지 않는 윤곽: 공방(전용 모델이 윤곽 꼭짓점 순서에 의존)과, 사용자가 그대로 두기로 한 분홍 주택.
// 분홍 주택은 갈림길 차도 폭 안에 서쪽 절반이 그려져 있지만 로드뷰 대조 모델을 유지합니다.
export const KEEP_MAPPED_OUTLINE = new Set([ARTIST_WORKSHOP_FOOTPRINT_ID, 1468590633])

// 보정하지 않는 윤곽 쪽에서는 반대로 도로를 고칩니다. 분홍 주택은 항공사진의 지붕과 윤곽이 맞고, 로드뷰 촬영
// 지점(골목 한가운데)이 서쪽 벽에서 약 3.5m 떨어져 있는데 OSM 골목 중심선은 벽에서 1m 남짓만 떨어져 있습니다.
// 그래서 이 건물들 가까이에서는 도로 중심선을 40cm 간격으로 나눈 뒤, 차도 가장자리가 벽에 닿지 않을 만큼
// 중심선을 벽 바깥으로 밀어 냅니다. 거리 장면(도로 그리기)과 건물 보정이 같은 함수를 씁니다.
let keptOutlines: [number, number][][] | undefined
function keptBuildingOutlines() {
  keptOutlines ??= footprints.filter((feature) => KEEP_MAPPED_OUTLINE.has(feature.properties.id))
    .map((feature) => (feature.geometry.coordinates[0].slice(0, -1) as StreetPoint[]).map(streetMeters))
  return keptOutlines
}

function insidePolygon([x, z]: [number, number], polygon: [number, number][]) {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [ax, az] = polygon[index], [bx, bz] = polygon[previous]
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside
  }
  return inside
}

function nearestOnPolygon(point: [number, number], polygon: [number, number][]): [number, number] {
  let best: [number, number] = polygon[0], distance = Infinity
  polygon.forEach((start, index) => {
    const end = polygon[(index + 1) % polygon.length]
    const dx = end[0] - start[0], dz = end[1] - start[1]
    const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) / (dx * dx + dz * dz || 1)))
    const candidate: [number, number] = [start[0] + dx * t, start[1] + dz * t]
    const current = Math.hypot(point[0] - candidate[0], point[1] - candidate[1])
    if (current < distance) { distance = current; best = candidate }
  })
  return best
}

export function clearRoadOfKeptBuildings(points: [number, number][], width: number): [number, number][] {
  const clearance = width / 2 + 0.15
  const polygons = keptBuildingOutlines()
  const distanceTo = (point: [number, number], polygon: [number, number][]) => insidePolygon(point, polygon) ? 0
    : Math.hypot(point[0] - nearestOnPolygon(point, polygon)[0], point[1] - nearestOnPolygon(point, polygon)[1])
  // 선분이 건물에서 (차도 반폭 + 1m) 안으로 들어오는지: 양 끝점이나 건물 모서리 중 하나라도 가까우면 됩니다.
  const touches = (a: [number, number], b: [number, number]) => polygons.some((polygon) =>
    distanceTo(a, polygon) < clearance + 1 || distanceTo(b, polygon) < clearance + 1
    || polygon.some((corner) => pointSegmentDistance(corner, a, b) < clearance + 1))
  if (!points.slice(1).some((point, index) => touches(points[index], point))) return points
  // 건물 가까운 구간만 잘게 나눕니다.
  const dense: [number, number][] = [points[0]]
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1], b = points[index]
    if (touches(a, b)) {
      const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.4)
      for (let step = 1; step < steps; step++) dense.push([a[0] + (b[0] - a[0]) * step / steps, a[1] + (b[1] - a[1]) * step / steps])
    }
    dense.push(b)
  }
  // 두 건물 사이 좁은 골목에서는 번갈아 밀리므로 몇 번 되풀이합니다.
  for (let round = 0; round < 4; round++) {
    for (let index = 0; index < dense.length; index++) {
      for (const polygon of polygons) {
        const point = dense[index]
        const nearest = nearestOnPolygon(point, polygon)
        const dx = point[0] - nearest[0], dz = point[1] - nearest[1]
        const distance = Math.hypot(dx, dz)
        const inside = insidePolygon(point, polygon)
        if (!inside && distance >= clearance) continue
        if (distance < 1e-6) continue
        const direction = inside ? -1 : 1
        dense[index] = [nearest[0] + dx / distance * clearance * direction, nearest[1] + dz / distance * clearance * direction]
      }
    }
  }
  return dense.filter((point, index) => index === 0
    || Math.hypot(point[0] - dense[index - 1][0], point[1] - dense[index - 1][1]) > 0.05)
}

// 직접 만든 3D 모델(그린하우스 등)은 윤곽을 깎을 수 없으므로, 차도(돌 포장 테두리 포함)와 겹치지 않을 때까지
// 겹친 부분의 반대쪽으로 조금씩 옮깁니다. 장면 미터 윤곽을 받아 옮길 거리 [dx, dz]를 돌려줍니다(최대 maxShift m).
// footIds: 비켜야 할 골목길(예: 실제로는 넓은 골목인 감내1로175번안길). 'all'이면 모든 골목길을 비킵니다.
export function shiftOffCarriageways(outline: [number, number][], maxShift = 4, footIds: ReadonlySet<number> | 'all' = new Set()): [number, number] {
  const shapes = carriagewayShapes().filter((shape) => !shape.foot || footIds === 'all'
    || (shape.id !== undefined && footIds.has(shape.id)))
  let dx = 0, dz = 0
  for (let step = 0; step < 80; step++) {
    const moved = outline.map(([x, z]) => [x + dx, z + dz] as [number, number])
    const [minX, maxX, minZ, maxZ] = ringBox(moved)
    const ring = [...moved, moved[0]]
    let overlap = 0, ox = 0, oz = 0
    for (const { polygon, box } of shapes) {
      if (!(box[0] < maxX && box[1] > minX && box[2] < maxZ && box[3] > minZ)) continue
      let pieces: polygonClipping.MultiPolygon = []
      try { pieces = polygonClipping.intersection([ring], polygon) } catch { continue }
      for (const piece of pieces) {
        const points = piece[0].slice(0, -1) as [number, number][]
        const area = polygonArea(points)
        overlap += area
        ox += points.reduce((sum, [x]) => sum + x, 0) / points.length * area
        oz += points.reduce((sum, [, z]) => sum + z, 0) / points.length * area
      }
    }
    if (overlap < 0.05) break
    const cx = moved.reduce((sum, [x]) => sum + x, 0) / moved.length
    const cz = moved.reduce((sum, [, z]) => sum + z, 0) / moved.length
    const vx = cx - ox / overlap, vz = cz - oz / overlap
    const length = Math.hypot(vx, vz)
    if (length < 1e-6 || Math.hypot(dx, dz) >= maxShift) break
    dx += vx / length * 0.1
    dz += vz / length * 0.1
  }
  return [dx, dz]
}

export function clearOfCarriageways(outline: StreetPoint[]): StreetPoint[] | null {
  const meters = outline.map(streetMeters)
  const [minX, maxX, minZ, maxZ] = ringBox(meters)
  const nearby = carriagewayShapes().filter(({ box }) => box[0] < maxX && box[1] > minX && box[2] < maxZ && box[3] > minZ)
  if (!nearby.length) return outline
  const snap = ([x, z]: [number, number]): [number, number] => [Math.round(x * 1000) / 1000, Math.round(z * 1000) / 1000]
  // 한 번에 여러 면을 빼면 부동소수점 교차가 쌓여 계산이 실패할 수 있어, 한 면씩 빼고 결과를 1mm 격자에 맞춥니다.
  let remaining: polygonClipping.MultiPolygon = [[[...meters, meters[0]].map(snap)]]
  const areaOf = (polygon: polygonClipping.Polygon) => polygonArea(polygon[0].slice(0, -1) as [number, number][])
  const original = polygonArea(meters)
  // 차도를 먼저 깎고, 보행로는 나중에 깎습니다.
  for (const { polygon } of [...nearby.filter((shape) => !shape.foot), ...nearby.filter((shape) => shape.foot)]) {
    try {
      remaining = polygonClipping.difference(remaining, polygon)
        .map((piece) => piece.map((ring) => ring.map(snap)))
    } catch {
      // 계산이 실패한 면은 건너뜁니다(그 부분만 보정되지 않음).
    }
  }
  const before = original
  const after = remaining.reduce((sum, polygon) => sum + areaOf(polygon), 0)
  if (before - after < 0.01) return outline
  // 여러 조각으로 갈라지면 가장 큰 조각을 건물로 남깁니다.
  const largest = remaining.reduce<polygonClipping.Polygon | undefined>((best, polygon) =>
    !best || areaOf(polygon) > areaOf(best) ? polygon : best, undefined)
  if (!largest) return null
  const simplified = simplifyRing(largest[0].slice(0, -1) as [number, number][])
  return simplified.length >= 3 ? simplified.map(streetPoint) : null
}

// 건물마다 도로·골목길과 겹친 부분을 깎는 계산(clearOfCarriageways)은 지도를 열 때 장면 만들기 시간의 큰 몫
// (휴대폰에서 약 3초)이라, scripts/build-road-ground.mjs가 미리 계산해 src/generated/building-outlines.json에
// 저장합니다. footprints 순서대로 0 = 원래 윤곽 그대로, null = 도로에 다 덮여 뺌, 배열 = 깎은 윤곽입니다.
// 건물 수가 다르면(데이터가 바뀌었는데 다시 만들지 않음) 저장본을 쓰지 않고 직접 계산합니다. 입력이 바뀌면
// 테스트(roadGround.test.ts)가 다시 만들라고 알려 줍니다.
type BakedOutline = 0 | null | StreetPoint[]
const BAKED_OUTLINES = (bakedOutlines as unknown as { outlines: BakedOutline[] }).outlines

function mappedOutline(feature: Footprint) {
  return feature.geometry.type === 'Polygon' ? feature.geometry.coordinates[0].slice(0, -1) as StreetPoint[] : null
}

// 저장본을 만들 때 씁니다(scripts/build-road-ground.mjs). 저장본을 보지 않고 모든 건물을 직접 깎습니다.
export function computeBuildingOutlines(): BakedOutline[] {
  return footprints.map((feature) => {
    const mapped = mappedOutline(feature)
    if (!mapped || mapped.length < 3 || KEEP_MAPPED_OUTLINE.has(feature.properties.id)) return 0
    const outline = clearOfCarriageways(mapped)
    return outline && outline.length === mapped.length && outline.every((point, index) => point[0] === mapped[index][0] && point[1] === mapped[index][1]) ? 0 : outline
  })
}

let cachedBuildings: StreetBuilding[] | undefined
export function getPhotographedStreetBuildings(): StreetBuilding[] {
  if (cachedBuildings) return cachedBuildings
  const result: StreetBuilding[] = []
  const baked = BAKED_OUTLINES.length === footprints.length ? BAKED_OUTLINES : null
  for (const [index, feature] of footprints.entries()) {
    const mapped = mappedOutline(feature)
    if (!mapped || mapped.length < 3) continue
    const stored = baked?.[index]
    const outline = KEEP_MAPPED_OUTLINE.has(feature.properties.id) ? mapped
      : stored === undefined ? clearOfCarriageways(mapped) : stored === 0 ? mapped : stored
    if (!outline) continue
    const meters = outline.map(streetMeters)
    const area = polygonArea(meters)
    if (area < 8) continue
    const center: StreetPoint = [
      outline.reduce((sum, point) => sum + point[0], 0) / outline.length,
      outline.reduce((sum, point) => sum + point[1], 0) / outline.length,
    ]
    if (!isInsideGamcheonMap(...center) || !isBuildingInBuildingArea(outline)) continue
    const near = nearestStreet(center)
    const edgeDistance = Math.min(...outline.map((point) => nearestStreet(point).distanceMeters))
    const concept = conceptByFootprint[feature.properties.id]
    const featured = Boolean(concept) || near.distanceMeters <= 16 || edgeDistance <= 8.5
    const minX = Math.min(...meters.map((point) => point[0]))
    const maxX = Math.max(...meters.map((point) => point[0]))
    const minZ = Math.min(...meters.map((point) => point[1]))
    const maxZ = Math.max(...meters.map((point) => point[1]))
    const aspect = Math.max(maxX - minX, maxZ - minZ) / Math.max(0.5, Math.min(maxX - minX, maxZ - minZ))
    const floors = featured ? (area > 95 ? 3 : 2) : 2
    const osm = osmMassing(feature.properties)
    // The green corner shop is the clearly identifiable southern landmark in
    // the supplied photos. Its OSM footprint is the nearest one to Cafe Abong.
    const cafeAbong = feature.properties.id === 1469906540
    const generic: StreetBuilding = {
      id: feature.properties.id,
      outline,
      heightMeters: cafeAbong ? 8.2 : osm.heightMeters ?? floors * 2.65 + 0.8,
      wallColor: cafeAbong ? 0x83ad46 : contextWalls[feature.properties.id % contextWalls.length],
      roofColor: cafeAbong ? 0x485d59 : genericRoof(feature.properties.id).color,
      roofFinish: cafeAbong ? 'sheet' : genericRoof(feature.properties.id).finish,
      accentColor: cafeAbong ? 0xdfc667 : 0x828a86,
      storefront: cafeAbong,
      shopfrontStyle: feature.properties.id % 4 === 0 ? 'shutter' : 'glass',
      // Long, narrow footprints are the most plausible sheet-roof candidates;
      // avoid sprinkling pitched roofs by OSM id across the whole district.
      roofStyle: osm.roofStyle ?? (aspect > 1.55 && area >= 18 && area < 130 ? 'gable' : 'flat'),
      brickFacade: false,
      detail: featured ? 'featured' : 'context',
      progress: near.progress,
    }
    const observed = observedByFootprint[feature.properties.id]
    const roadview = roadviewByFootprint[feature.properties.id]
    const appearance: StreetBuilding = concept ? { ...generic, ...conceptAppearance[concept], concept }
      : observed ? { ...generic, ...observed, detail: 'featured' }
        : roadview ? { ...generic, ...roadview, detail: 'featured' }
        : generic
    result.push(appearance)
  }
  inferNearbyFacades(result)
  const outlines = result.map((building) => building.outline.map(streetMeters))
  const bounds = outlines.map((outline) => ({
    west: Math.min(...outline.map(([x]) => x)), east: Math.max(...outline.map(([x]) => x)),
    north: Math.min(...outline.map(([, z]) => z)), south: Math.max(...outline.map(([, z]) => z)),
  }))
  for (let index = 0; index < result.length; index++) {
    const current = bounds[index]
    const neighbors = outlines.filter((_, other) => other !== index
      && bounds[other].west <= current.east + 0.7 && bounds[other].east >= current.west - 0.7
      && bounds[other].north <= current.south + 0.7 && bounds[other].south >= current.north - 0.7)
    result[index].sharedEdges = sharedBuildingEdges(outlines[index], neighbors)
  }
  cachedBuildings = result
  return result
}

export const PHOTOGRAPHED_STREET_GEOJSON = {
  type: 'Feature',
  properties: { name: '촬영한 골목의 포장 면' },
  geometry: { type: 'LineString', coordinates: PHOTOGRAPHED_STREET },
} as const

import { MercatorCoordinate } from 'maplibre-gl'
import type { CustomLayerInterface, Map } from 'maplibre-gl'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as polygonClipping from 'polygon-clipping'
import { ARTIST_WORKSHOP_FOOTPRINT_ID, getPhotographedStreetBuildings, shiftOffCarriageways, MEETING_CIRCLE_CENTER, nearestStreet, PHOTOGRAPHED_STREET, STREET_ORIGIN, streetMeters } from './streetSceneData'
import { BEAUTIFUL_HANGUL_CENTER, BEAUTIFUL_HANGUL_FOOTPRINT_ID, BEAUTIFUL_HANGUL_OUTLINE, BEAUTIFUL_HANGUL_ROTATION } from './beautifulHangul'
import type { FacadeOpening } from './streetSceneData'
import { clipPolygonToBounds, getStreetSceneBounds, STREET_SURFACE_WAYS } from './streetSurfaceData'
import { isSafeGableOutline, roofInteriorPoint } from './streetRoofGeometry'
import { distanceToRoad } from './streetRoadGeometry'
import { conceptTexture } from './streetTextures'
import roadGroundCache from './generated/road-ground.json'
import { ALLEY_EDGE, roadOutlines, unionRoadAreas } from './roadCorridors'
import { isBakedAlley } from './recordedAlleys'
import type { Alley } from './alleys'
import type { TerrainSampler } from './terrain'
import type { RoadGround } from './roadGround'
// 길을 가리는 건물 반투명(findRoadOccluders)은 2026-10-09 주석 처리했습니다. 되살릴 때 아래 두 줄의 주석을 풉니다.
// import { buildRoadRuns } from './roadGround'
// import { findRoadOccluders, RoadIndex } from './streetOcclusion'
import { findPointOccluders } from './streetOcclusion'
import type { Occluder } from './streetOcclusion'
import { buildArtistWorkshopModel } from './artistWorkshopModel'
import type { WorkshopFinish } from './artistWorkshopModel'
import type { ConceptSurface } from './streetTextures'
import { addSceneLights, bakeShadowMap, configureRenderer, createShadowCatcher, fitShadowCatcher } from './threeShadows'
import { distanceToSegment, facingRotation, outlineCenter, polygonArea } from './planGeometry'
import buildingFootprints from './gamcheon-buildings.json'

type StreetBuilding = ReturnType<typeof getPhotographedStreetBuildings>[number]
type SlotMaterial = THREE.MeshStandardMaterial | THREE.MeshLambertMaterial
// plain: 고리 묶음(공방 밖 건물)에서 비치지 않는 건물을 그리는 재질. 점무늬 셰이더(discard)가 없어 GPU가
// 가려진 픽셀을 미리 건너뛸 수 있습니다. material은 길을 가려 비치게 그릴 건물에 씁니다.
// flushed: 이 재질로 이미 만든 메시들. 먼 동네를 나눠 만드는 동안 여러 개가 생기므로, 다 만든 뒤 하나로 합칩니다.
type MaterialSlot = {
  material: SlotMaterial; plain?: SlotMaterial; geometries: THREE.BufferGeometry[]; ground: boolean; parent: THREE.Object3D
  // 3D 지형에서 바닥 층을 그리는 순서(아래 층부터). 있으면 깊이값을 남기지 않고 이 순서대로 덮어 그립니다.
  groundLayer?: number
  flushed: { geometry: THREE.BufferGeometry; meshes: THREE.Mesh[]; split?: FadeSplit }[]
}
// 고리 메시 하나를 '비치지 않는 건물'과 '비치는 건물' 두 메시로 나눠 그리기 위한 정보입니다. 두 메시는 꼭짓점을
// 함께 쓰고, 한 인덱스 버퍼의 앞부분(plain)과 뒷부분(fade)을 그립니다. runs: [건물 번호, 첫 꼭짓점, 꼭짓점 수]
type FadeSplit = { runs: Int32Array; index: THREE.BufferAttribute; plain: THREE.Mesh; fade: THREE.Mesh; state: Uint8Array }
type SurfaceFinish = WorkshopFinish
type FacadeKind = NonNullable<StreetBuilding['concept']>
// 그림자를 계산하는 사각 범위(장면 미터). 첫 화면인 촬영 거리와 공방 주변에 해상도를 집중합니다.
const SHADOW_CENTER: [number, number] = [20, -40]
const SHADOW_EXTENT = 260


const ROAD_GROUND = roadGroundCache as unknown as RoadGround
// 기둥·난간처럼 기울어 놓이는 막대는 끝면이 보일 수 있어 여섯 면을 모두 둡니다(복사해 쓰려고 미리 만듦).
const UNIT_BEAM = new THREE.BoxGeometry(1, 1, 1).toNonIndexed()
// 상자의 아랫면은 위에서 내려다보는 지도에서 보이지 않으므로 빼 둡니다(삼각형 1/6 절약).
// BoxGeometry의 면 순서는 +x, -x, +y, -y, +z, -z이고 면마다 꼭짓점 6개입니다.
const UNIT_BOX = (() => {
  const full = new THREE.BoxGeometry(1, 1, 1).toNonIndexed()
  const keep = (attribute: THREE.BufferAttribute) => {
    const size = attribute.itemSize
    const array = attribute.array as Float32Array
    return new THREE.Float32BufferAttribute([...array.slice(0, 18 * size), ...array.slice(24 * size)], size)
  }
  const box = new THREE.BufferGeometry()
  for (const name of ['position', 'normal', 'uv']) box.setAttribute(name, keep(full.getAttribute(name) as THREE.BufferAttribute))
  full.dispose()
  return box
})()
// 합친 도형의 건물 번호 속성에서 같은 건물이 이어지는 구간을 [번호, 첫 꼭짓점, 꼭짓점 수]로 모읍니다.
// 건물마다 도형을 이어서 넣으므로 한 건물은 한 메시 안에서 대개 한 구간입니다.
export function buildingRuns(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
  const runs: number[] = []
  for (let vertex = 0; vertex < attribute.count; vertex++) {
    const building = attribute.getX(vertex)
    if (runs.length && runs[runs.length - 3] === building) runs[runs.length - 1]++
    else runs.push(building, vertex, 1)
  }
  return Int32Array.from(runs)
}

// 그린하우스(감내1로175번안길 들머리)는 세 OSM 윤곽 대신 사진과 평면도를 바탕으로 만든 연결형 모델입니다.
// 형태는 유지하되 OSM 세 윤곽의 전체 점유 범위에 맞춰 배치합니다.
export const GREEN_HOUSE_FOOTPRINT_IDS = new Set([1468551429, 1468551431, 1468551433])
const GREEN_HOUSE_URL = new URL('./assets/models/custom/greenhouse-sixpence-connected.glb', import.meta.url).href
const BEAUTIFUL_HANGUL_URL = new URL('./assets/models/custom/beautiful-hangul-studio.glb', import.meta.url).href
// scripts/build-greenhouse-from-plan.mjs의 외곽 trace(A~J, 평면도 픽셀)와 월드 미터 변환. 평면도를 실제 축척(1:1)으로
// 옮긴 모델이라 늘이거나 줄이지 않습니다(2026-10-09, 예전에는 OSM 세 윤곽 범위에 맞춰 늘였음).
const GREEN_HOUSE_TRACE: [number, number][] = [[39, 153], [145, 65], [209, 40], [254, 143], [263, 280], [188, 283], [174, 190], [139, 213], [169, 281], [126, 327]]
const GREEN_HOUSE_EAVES = 0.9
const GREEN_HOUSE_PLAN = GREEN_HOUSE_TRACE.map(([px, py]) => [(px - 151) * 0.076, (py - 183) * 0.076] as [number, number])
// 실제 비율 그대로 OSM 세 윤곽을 합친 범위의 가운데에 두고, 골목(감내1로175번길) 차도와 겹치면 겹치지 않을 때까지
// 반대쪽으로 비켜 놓습니다. OSM 윤곽 51433의 동쪽 벽이 골목 중심선 위에 그려져 있어 그대로 두면 골목을 덮습니다.
export function greenHouseOsmPlacement() {
  const points = buildingFootprints.features
    .filter((feature) => GREEN_HOUSE_FOOTPRINT_IDS.has(feature.properties.id))
    .flatMap((feature) => feature.geometry.coordinates[0].map(([longitude, latitude]) => streetMeters([longitude, latitude])))
  if (!points.length) throw new Error('Green House OSM footprints are missing')
  const xs = points.map(([x]) => x), zs = points.map(([, z]) => z)
  const planXs = GREEN_HOUSE_PLAN.map(([x]) => x), planZs = GREEN_HOUSE_PLAN.map(([, z]) => z)
  const x = (Math.min(...xs) + Math.max(...xs)) / 2 - (Math.min(...planXs) + Math.max(...planXs)) / 2
  const z = (Math.min(...zs) + Math.max(...zs)) / 2 - (Math.min(...planZs) + Math.max(...planZs)) / 2
  // 처마·차양이 평면 윤곽 밖으로 최대 0.9m 나오므로, 윤곽을 그만큼 바깥으로 넓혀 차도와 겹치는지 봅니다.
  const reach = GREEN_HOUSE_PLAN.map(([px, pz]) => {
    const length = Math.hypot(px, pz) || 1
    return [px + px / length * GREEN_HOUSE_EAVES + x, pz + pz / length * GREEN_HOUSE_EAVES + z] as [number, number]
  })
  const [dx, dz] = shiftOffCarriageways(reach, 4, 'all')
  return { scaleX: 1, scaleZ: 1, x: x + dx, z: z + dz }
}

// 골목길 포장 색(따뜻한 베이지)
const ALLEY_PAVING_COLOR = 0xead2ad

// 3D 지형에서 바닥(길·포장)을 지형 위로 띄우는 높이(m). 바탕 지도의 지형 면과 겹쳐 깜빡이지 않게 합니다.
const TERRAIN_GROUND_LIFT = 0.35
const TERRAIN_BUILDING_CLEARANCE = TERRAIN_GROUND_LIFT + 0.12
// 3D 지형의 바닥 층 순서. 층마다 삼각형을 다르게 나눠 비탈에 얹으면 높이가 몇 cm~수십 cm씩 어긋나, 몇 cm 차이로
// 쌓은 층(흰 바닥·돌 포장·골목길·차도)이 서로 뚫고 나와 길에 얼룩(노이즈)이 생깁니다. 그래서 지형에서는 바닥이
// 깊이값을 남기지 않고 아래 층부터 차례로 덮어 그리게 합니다(건물·나무는 그 뒤에 깊이를 비교해 그립니다).
const TERRAIN_GROUND_ORDER: Partial<Record<ConceptSurface, number>> = {
  'ground-pavers': -0.95, 'ground-grass': -0.9, 'ground-asphalt': -0.85, 'ground-cobble': -0.85, 'ground-stone': -0.8, 'ground-lane': -0.7,
}
// 배포 뒤 새로 추가한 골목길(따로 그리는 띠): 돌 포장 위, 차도 아래
const TERRAIN_EXTRA_ALLEY_ORDER = [-0.78, -0.76]

// 평평하게 만든 바닥 도형을 지형에 얹습니다. 긴 변을 maxEdge(m) 이하로 나눈 뒤 꼭짓점마다 지형 높이를 더합니다.
// (넓은 도로 면을 그대로 올리면 큰 삼각형이 비탈을 가로질러 땅속으로 파고들기 때문입니다.)
// 변의 가운데 점은 이웃 삼각형과 함께 쓰므로(변마다 한 번만 만듦) 나눈 자리에 틈이 생기지 않습니다.
export function drapeOnTerrain(geometry: THREE.BufferGeometry, terrain: Pick<TerrainSampler, 'height'>, lift = TERRAIN_GROUND_LIFT, maxEdge = 6) {
  const names = Object.keys(geometry.attributes)
  const attributes = names.map((name) => geometry.getAttribute(name) as THREE.BufferAttribute)
  const sizes = attributes.map((attribute) => attribute.itemSize)
  const stride = sizes.reduce((sum, size) => sum + size, 0)
  const positionOffset = sizes.slice(0, names.indexOf('position')).reduce((sum, size) => sum + size, 0)
  const count = attributes[0].count
  // 꼭짓점마다 모든 속성 값을 이어 붙인 표
  const pool: number[] = []
  for (let vertex = 0; vertex < count; vertex++) {
    attributes.forEach((attribute, a) => { for (let k = 0; k < sizes[a]; k++) pool.push(attribute.getComponent(vertex, k)) })
  }
  const x = (vertex: number) => pool[vertex * stride + positionOffset]
  const z = (vertex: number) => pool[vertex * stride + positionOffset + 2]
  const length2 = (a: number, b: number) => (x(a) - x(b)) ** 2 + (z(a) - z(b)) ** 2
  const middles = new globalThis.Map<number, number>()
  const middle = (a: number, b: number) => {
    const key = a < b ? a * 16_777_216 + b : b * 16_777_216 + a
    let vertex = middles.get(key)
    if (vertex === undefined) {
      vertex = pool.length / stride
      for (let k = 0; k < stride; k++) pool.push((pool[a * stride + k] + pool[b * stride + k]) / 2)
      middles.set(key, vertex)
    }
    return vertex
  }
  const stack = geometry.index ? Array.from(geometry.index.array) : Array.from({ length: count }, (_, vertex) => vertex)
  const triangles: number[] = []
  const limit = maxEdge * maxEdge
  while (stack.length >= 3) {
    const c = stack.pop()!, b = stack.pop()!, a = stack.pop()!
    const ab = length2(a, b), bc = length2(b, c), ca = length2(c, a)
    const longest = Math.max(ab, bc, ca)
    if (longest <= limit || pool.length > 6_000_000) { triangles.push(a, b, c); continue }
    // 가장 긴 변의 가운데에서 둘로 나눕니다(감는 방향은 그대로).
    if (longest === ab) { const m = middle(a, b); stack.push(a, m, c, m, b, c) }
    else if (longest === bc) { const m = middle(b, c); stack.push(b, m, a, m, c, a) }
    else { const m = middle(c, a); stack.push(c, m, b, m, a, b) }
  }
  const vertices = pool.length / stride
  for (let vertex = 0; vertex < vertices; vertex++) pool[vertex * stride + positionOffset + 1] += terrain.height(x(vertex), z(vertex)) + lift
  const result = new THREE.BufferGeometry()
  let offset = 0
  names.forEach((name, a) => {
    const values = new Float32Array(vertices * sizes[a])
    for (let vertex = 0; vertex < vertices; vertex++) for (let k = 0; k < sizes[a]; k++) values[vertex * sizes[a] + k] = pool[vertex * stride + offset + k]
    result.setAttribute(name, new THREE.Float32BufferAttribute(values, sizes[a]))
    offset += sizes[a]
  })
  result.setIndex(triangles)
  if (result.getAttribute('normal')) result.computeVertexNormals()
  geometry.dispose()
  return result
}

export const SCENE_BUILD_MEASURE = 'gamcheon-map:street-scene-build'
const isTouchDevice = () => typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0
  && typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
// 먼 동네 벽 텍스처 한 칸(창 하나와 층 띠)의 크기(m)
const DISTRICT_BAY_WIDTH = 3.1
const DISTRICT_FLOOR_HEIGHT = 2.65
// 건물별 비침 정도를 담는 텍스처 한 변의 크기(64×64 = 건물 4096동까지)
const FADE_TEXTURE_SIZE = 64
// 길을 가리는 거리 건물이 남기는 픽셀 비율(형태는 알아보되 뒤의 길이 보이도록)
export const STREET_FADE_OPACITY = 0.45
// 건물 숨기기 애니메이션: 공방 중심에서의 거리(m)로 나눈 고리, 고리 하나가 움직이는 시간과 고리 사이 간격
const BUILDING_RINGS = [45, 100, 180, 300, Infinity]
const RISE_DURATION_MS = 650
const RISE_STAGGER_MS = 110
const easeInCubic = (t: number) => t * t * t
// 끝에서 살짝 위로 넘쳤다가 자리 잡아, 땅에서 솟아나는 느낌을 줍니다.
const easeOutBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2
export const DISTRICT_BUILD_MEASURE = 'gamcheon-map:district-build'



// Geometry in the photographed corridor uses the same east/up/south metre axes
// as the editable GLB layer. OSM footprints provide the plan; video/photographs
// inform the facade treatment, while unknown heights remain deliberately modest.
export class StreetSceneLayer implements CustomLayerInterface {
  readonly id = 'gamcheon-photographed-street-3d'
  readonly type = 'custom' as const
  readonly renderingMode = '3d' as const

  private map: Map | null = null
  private renderer: THREE.WebGLRenderer | null = null
  private camera = new THREE.Camera()
  private scene = new THREE.Scene()
  private slots = new globalThis.Map<string, MaterialSlot>()
  private meshes: THREE.Mesh[] = []
  private fadeSplits: FadeSplit[] = []
  // 고리마다 메시는 따로 두되 재질은 함께 씁니다. 같은 재질을 잇달아 그리면 three.js가 재질·조명 값을 다시
  // 올리지 않아 그리기 호출마다 드는 CPU 시간이 줄어듭니다. order: 같은 재질끼리 이어 그리게 하는 그리기 순서
  private sharedMaterials = new globalThis.Map<string, { material: SlotMaterial; plain?: SlotMaterial }>()
  private materialOrder = new globalThis.Map<THREE.Material, number>()
  // 공방·시안 건물처럼 안쪽 면이나 뒤집힌 면이 보일 수 있는 도형은 양면으로 그립니다(나머지는 바깥 면만).
  private doubleSided = false
  private signMeshes: THREE.Mesh[] = []
  private signTextures: THREE.CanvasTexture[] = []
  private conceptTextures = new globalThis.Map<ConceptSurface, THREE.DataTexture>()
  private shadowCatcher: THREE.Mesh | null = null
  private shadowsBaked = false
  // 공방을 뺀 건물(벽·지붕·간판·사진 외관)은 이 묶음에 넣어 한꺼번에 숨기거나 보일 수 있게 합니다.
  // 도로·바닥·나무·전신주와 공방은 장면에 바로 넣어 늘 보입니다.
  // 공방에서 가까운 순서의 고리(BUILDING_RINGS)로 나눠, 숨길 때 공방에서 바깥쪽으로 물결치듯 땅으로 꺼지게 합니다.
  private readonly buildingRings = BUILDING_RINGS.map(() => new THREE.Group())
  // 고리별로 땅 위에 올라와 있는 정도(1: 모두 올라옴, 0: 땅속에 숨음)
  private ringRise = BUILDING_RINGS.map(() => 1)
  private ringDepth = BUILDING_RINGS.map(() => 0)
  private riseAnimation = 0
  // 내 위치(GPS)를 가리는 근처 건물만 점무늬로 비치게 하는 자동 반투명(예전에는 길을 가리는 건물 기준). 건물마다 번호(buildingIndex 정점 속성)를 붙이고,
  // 번호별 비침 정도를 작은 텍스처(fadeTexture)에 담아 셰이더가 읽습니다.
  private occluders: Occluder[] = []
  private buildingContext: Occluder | null = null
  private currentBuilding = -1
  private readonly fadeData = new Uint8Array(FADE_TEXTURE_SIZE * FADE_TEXTURE_SIZE * 4).fill(255)
  private readonly fadeTexture = new THREE.DataTexture(this.fadeData, FADE_TEXTURE_SIZE, FADE_TEXTURE_SIZE, THREE.RGBAFormat)
  private readonly fadeUniform = { value: this.fadeTexture }
  // private roadIndex: RoadIndex | null = null
  // 내 위치(GPS, 장면 미터). 이 위치를 가리는 근처 건물을 반투명하게 합니다.
  private myPosition: [number, number] | null = null
  private autoSeeThrough = true
  private occlusionTimer: ReturnType<typeof setTimeout> | null = null
  private occluding = new Set<number>()
  // 공방을 뺀 건물의 불투명도(1: 불투명). '3D 건물 모두 반투명하게'와 골목길 편집 중에 낮춥니다.
  private buildingOpacity = 1
  // 고리 안에서 그림자를 드리우는 메시(애니메이션 중에만 잠시 그림자를 끕니다)
  private ringShadowCasters: THREE.Mesh[] = []
  private group: 'scene' | number = 'scene'
  private extraAlleyMeshes: THREE.Mesh[] = []
  private extraAlleyTexture?: THREE.DataTexture
  private workshopCenter: [number, number] = [0, 0]
  private pendingDistrict: { building: StreetBuilding; outline: [number, number][]; distance: number }[] = []

  // 3D 지형(켜져 있을 때만). 건물은 윤곽의 높은 땅 위에 세우고, 낮은 쪽은 기초 벽으로 연결합니다.
  private readonly terrain?: TerrainSampler
  private buildingBase = 0
  private occluderBases: number[] = []

  constructor(options: { terrain?: TerrainSampler } = {}) {
    const started = performance.now()
    this.terrain = options.terrain
    // 휴대폰·태블릿(터치 화면)은 그림자 지도를 2048로 줄여 그래픽 메모리와 그리기 부담을 덜어 줍니다.
    addSceneLights(this.scene, SHADOW_CENTER, SHADOW_EXTENT, isTouchDevice() ? 2048 : 4096)
    this.buildingRings.forEach((ring) => this.scene.add(ring))
    this.build()
    // 성능 예산 확인용: 브라우저 개발자 도구의 Performance 탭이나 performance.getEntriesByName으로 볼 수 있습니다.
    performance.measure(SCENE_BUILD_MEASURE, { start: started, end: performance.now() })
    const bounds = getStreetSceneBounds(20)
    this.shadowCatcher = createShadowCatcher()
    fitShadowCatcher(this.shadowCatcher, bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ)
    // 지형에서는 평평한 그림자 받이가 언덕을 가로지르므로 쓰지 않습니다(지형에 얹은 바닥이 그림자를 받습니다).
    if (!this.terrain) this.scene.add(this.shadowCatcher)
  }

  // 색은 꼭짓점 색(vertex color)으로 넣고 재질은 질감·유리 여부로만 나눕니다. 색마다 재질을 만들면 그리기
  // 호출이 1천 개를 넘어 휴대폰에서 끊기므로, 같은 질감의 도형을 색이 달라도 한 번에 그립니다.
  private material(glass = false, surface?: ConceptSurface) {
    const doubleSided = this.doubleSided || glass
    const key = `${this.group}|${glass}-${surface ?? ''}${doubleSided ? '|both' : ''}`
    let slot = this.slots.get(key)
    if (!slot) {
      let map: THREE.DataTexture | undefined
      if (surface) {
        map = this.conceptTextures.get(surface)
        if (!map) {
          map = conceptTexture(surface)
          this.conceptTextures.set(surface, map)
        }
      }
      const side = doubleSided ? THREE.DoubleSide : THREE.FrontSide
      const textures = map ? { map,
        ...((surface === 'workshop-brick' || surface === 'lane-brick')
          ? { bumpMap: map, bumpScale: surface === 'workshop-brick' ? 0.018 : 0.009 } : {}),
      } : {}
      // 벽·지붕은 거의 반사가 없으므로(거칠기 0.86) 픽셀 계산이 가벼운 Lambert로 그립니다. 휴대폰에서 프레임을
      // 가장 많이 잡아먹는 것이 픽셀 계산이라 차이가 큽니다. 반짝임이 보이는 유리만 PBR(Standard)로 둡니다.
      const shared = this.sharedMaterial(key, () => glass
        ? new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.22, metalness: 0.2, side, ...textures })
        : new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side, ...textures }))
      slot = {
        ...shared, geometries: [], ground: surface?.startsWith('ground-') ?? false, parent: this.currentParent(), flushed: [],
        groundLayer: this.terrain && this.group === 'scene' && surface ? TERRAIN_GROUND_ORDER[surface] : undefined,
      }
      this.slots.set(key, slot)
    }
    return slot
  }

  private finishedMaterial(color: number, finish: SurfaceFinish) {
    const key = `${this.group}|${finish}-${color}`
    let slot = this.slots.get(key)
    if (!slot) {
      const transparent = finish === 'clear-glass' || finish === 'halo'
      slot = {
        ...this.sharedMaterial(key, () => new THREE.MeshStandardMaterial({
          color, side: THREE.DoubleSide,
          roughness: finish === 'clear-glass' ? 0.08 : 0.7, metalness: finish === 'clear-glass' ? 0.1 : 0,
          emissive: finish === 'clear-glass' ? 0x000000 : color,
          emissiveIntensity: finish === 'glow' ? 1.1 : finish === 'halo' ? 0.55 : finish === 'lit' ? 0.32 : 0,
          transparent, opacity: finish === 'clear-glass' ? 0.3 : finish === 'halo' ? 0.72 : 1,
          depthWrite: !transparent,
          // 비치는 양면 재질을 three.js는 뒷면·앞면 두 번 그리며 매 프레임 셰이더를 다시 고릅니다. 얇은 면이라 한 번이면 됩니다.
          forceSinglePass: true,
        })),
        geometries: [],
        // 유리와 바닥 띠는 그림자를 드리우지 않습니다.
        ground: transparent,
        parent: this.currentParent(),
        flushed: [],
      }
      this.slots.set(key, slot)
    }
    return slot
  }

  // 슬롯 키(고리 번호|…)에서 고리 번호를 뺀 이름으로 재질을 함께 씁니다. 고리 묶음의 재질은 점무늬 없는
  // 복사본(plain)을 먼저 떠 두고, 원본에 점무늬 셰이더를 붙입니다.
  private sharedMaterial(slotKey: string, create: () => SlotMaterial) {
    const ring = this.group !== 'scene'
    const key = `${ring ? 'ring' : 'scene'}|${slotKey.slice(slotKey.indexOf('|') + 1)}`
    let shared = this.sharedMaterials.get(key)
    if (!shared) {
      const material = create()
      shared = { material }
      if (ring) {
        shared.plain = material.clone()
        this.patchFade(material)
      }
      this.sharedMaterials.set(key, shared)
    }
    return shared
  }

  private currentParent(): THREE.Object3D {
    return this.group === 'scene' ? this.scene : this.buildingRings[this.group]
  }

  // 공방을 뺀 건물의 고리 번호: 공방 중심에서 떨어진 거리로 정합니다.
  private ringOf(outline: [number, number][]) {
    const [x, z] = outlineCenter(outline)
    const distance = Math.hypot(x - this.workshopCenter[0], z - this.workshopCenter[1])
    const ring = BUILDING_RINGS.findIndex((limit) => distance < limit)
    return ring < 0 ? BUILDING_RINGS.length - 1 : ring
  }

  private applyRise() {
    this.buildingRings.forEach((ring, index) => {
      // 건물을 그 고리에서 가장 높은 건물 높이만큼 땅(바닥판) 아래로 내립니다.
      ring.position.y = -this.ringDepth[index] * (1 - this.ringRise[index])
      ring.visible = this.ringRise[index] > 0.001
    })
    this.map?.triggerRepaint()
  }

  // 그림자 지도(4096px)를 매 프레임 다시 계산하면 프레임이 크게 떨어지므로, 움직이는 동안에는 숨기는 건물의
  // 그림자를 잠시 끄고 시작과 끝에 한 번씩만 계산합니다.
  private setRingShadows(cast: boolean) {
    // 반투명 상태에서는 애니메이션이 끝나도 그림자를 다시 켜지 않습니다.
    for (const mesh of this.ringShadowCasters) mesh.castShadow = cast && this.buildingOpacity >= 1
    this.shadowsBaked = false
  }

  // 공방을 뺀 건물을 반투명하게 하거나 되돌립니다. 길이 비쳐 보이도록 깊이 기록을 끄고 섞어 그립니다.
  setBuildingOpacity(opacity: number) {
    if (this.buildingOpacity === opacity) return
    this.buildingOpacity = opacity
    for (const ring of this.buildingRings) ring.traverse((object) => {
      if (object instanceof THREE.Mesh) this.applyBuildingOpacity(object)
    })
    // 반투명할 때는 건물 그림자가 길을 어둡게 가리지 않도록 그림자도 끕니다.
    this.setRingShadows(opacity >= 1)
    // 모두 반투명일 때는 건물별 점무늬를 풀고, 되돌리면 다시 내 위치를 가리는 건물을 고릅니다.
    this.scheduleOcclusion()
    this.map?.triggerRepaint()
  }

  private applyBuildingOpacity(mesh: THREE.Mesh) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials as THREE.Material[]) {
      // 처음 값을 기억해 두었다가 불투명으로 돌아갈 때 되돌립니다(유리·간판처럼 원래 투명한 재질 포함).
      const base = (material.userData.base ??= { opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite, side: material.side })
      const seeThrough = this.buildingOpacity < 1
      const transparent = seeThrough || base.transparent
      if (material.transparent !== transparent) material.needsUpdate = true
      material.transparent = transparent
      material.opacity = base.opacity * this.buildingOpacity
      material.depthWrite = seeThrough ? false : base.depthWrite
      // 벽 안쪽 면까지 겹쳐 칠해지면 탁하게 어두워지므로, 반투명할 때는 바깥 면만 그립니다(원래 투명한 간판 등은 그대로).
      const side = seeThrough && !base.transparent ? THREE.FrontSide : base.side
      if (material.side !== side) { material.side = side; material.needsUpdate = true }
    }
    // 섞어 그릴 때는 재질별 순서 대신 멀리 있는 것부터 그리도록(three.js 기본 정렬) 순서를 비웁니다.
    mesh.userData.baseOrder ??= mesh.renderOrder
    const wasTransparent = materials.some((material) => (material as THREE.Material).userData.base.transparent)
    mesh.renderOrder = this.buildingOpacity < 1 && !wasTransparent ? 0 : mesh.userData.baseOrder
  }

  // 공방을 뺀 건물을 숨기거나 다시 보입니다. 숨길 때는 땅으로 꺼지고, 보일 때는 땅에서 솟아오릅니다.
  // animate가 false이거나 사용자가 움직임 줄이기를 켰으면 바로 바꿉니다.
  setOtherBuildingsHidden(hidden: boolean, animate = true) {
    const target = hidden ? 0 : 1
    cancelAnimationFrame(this.riseAnimation)
    this.riseAnimation = 0
    const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!animate || reduceMotion || typeof requestAnimationFrame !== 'function') {
      this.ringRise = this.ringRise.map(() => target)
      this.setRingShadows(true)
      this.applyRise()
      return
    }
    this.setRingShadows(false)
    const from = [...this.ringRise]
    const started = performance.now()
    const frame = () => {
      const elapsed = performance.now() - started
      let running = false
      this.ringRise = from.map((value, index) => {
        // 공방에 가까운 고리부터 차례로 움직입니다.
        const local = Math.min(1, Math.max(0, (elapsed - index * RISE_STAGGER_MS) / RISE_DURATION_MS))
        if (local < 1) running = true
        return value + (target - value) * (hidden ? easeInCubic(local) : easeOutBack(local))
      })
      this.applyRise()
      this.riseAnimation = running ? requestAnimationFrame(frame) : 0
      if (!running) this.setRingShadows(true)
    }
    frame()
  }

  private addFinishedGeometry(color: number, geometry: THREE.BufferGeometry, finish?: SurfaceFinish) {
    if (!finish) return this.addGeometry(color, geometry)
    geometry = this.onTerrain(geometry)
    const plain = geometry.index ? geometry.toNonIndexed() : geometry
    if (plain !== geometry) geometry.dispose()
    this.tagBuilding(plain)
    this.finishedMaterial(color, finish).geometries.push(plain)
  }

  // 3D 지형이면 도형을 제 높이로 올립니다: 건물(과 그 간판·장식)은 건물 바닥 높이만큼 통째로, 바닥처럼 납작한
  // 도형은 지형에 얹고, 나무 같은 작은 물체는 그 자리 땅 높이만큼 올립니다.
  private onTerrain(geometry: THREE.BufferGeometry, maxGroundEdge = 6) {
    const terrain = this.terrain
    if (!terrain) return geometry
    if (this.buildingContext) {
      geometry.translate(0, this.buildingBase, 0)
      return geometry
    }
    geometry.computeBoundingBox()
    const box = geometry.boundingBox!
    if (box.max.y - box.min.y < 0.6) return drapeOnTerrain(geometry, terrain, TERRAIN_GROUND_LIFT, maxGroundEdge)
    geometry.translate(0, terrain.height((box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2), 0)
    return geometry
  }

  private terrainBuildingBase(outline: [number, number][]) {
    return this.terrain ? this.terrain.highest(outline) + TERRAIN_BUILDING_CLEARANCE : 0
  }

  private terrainFoundationFaces(outline: [number, number][], base: number) {
    const terrain = this.terrain
    const faces: THREE.BufferGeometry[] = []
    if (!terrain || outline.length < 3) return faces
    const [cx, cz] = outlineCenter(outline)
    for (let index = 0; index < outline.length; index++) {
      const [ax, az] = outline[index], [bx, bz] = outline[(index + 1) % outline.length]
      const length = Math.hypot(bx - ax, bz - az)
      if (length < 0.15) continue
      const ux = (bx - ax) / length, uz = (bz - az) / length
      const mx = (ax + bx) / 2, mz = (az + bz) / 2
      const outward = -uz * (mx - cx) + ux * (mz - cz) >= 0 ? 1 : -1
      const nx = -uz * outward, nz = ux * outward
      const flip = (bx - ax) * nz - (bz - az) * nx < 0
      const [p, q] = flip ? [[bx, bz], [ax, az]] : [[ax, az], [bx, bz]]
      const bottomP = terrain.height(p[0], p[1]) + TERRAIN_GROUND_LIFT - base
      const bottomQ = terrain.height(q[0], q[1]) + TERRAIN_GROUND_LIFT - base
      const offset = 0.08
      const a = [p[0] + nx * offset, bottomP, p[1] + nz * offset]
      const b = [q[0] + nx * offset, bottomQ, q[1] + nz * offset]
      const c = [q[0] + nx * offset, 0, q[1] + nz * offset]
      const d = [p[0] + nx * offset, 0, p[1] + nz * offset]
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3))
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, length / 2, 0, length / 2, 1, 0, 0, length / 2, 1, 0, 1], 2))
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(Array(6).fill([nx, 0, nz]).flat(), 3))
      faces.push(geometry)
    }
    return faces
  }

  private addTerrainFoundation(outline: [number, number][]) {
    for (const geometry of this.terrainFoundationFaces(outline, this.buildingBase))
      this.addGeometry(0xb6bfba, geometry, false, 'context-stone')
  }

  private modelFoundations: THREE.Mesh[] = []
  private addModelFoundation(outline: [number, number][], base: number) {
    const faces = this.terrainFoundationFaces(outline, base)
    if (!faces.length) return
    const geometry = mergeGeometries(faces)
    faces.forEach((face) => face.dispose())
    geometry.translate(0, base, 0)
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: 0xb6bfba, side: THREE.DoubleSide }))
    mesh.castShadow = true
    mesh.receiveShadow = true
    this.modelFoundations.push(mesh)
    this.scene.add(mesh)
  }

  private addGeometry(color: number, geometry: THREE.BufferGeometry, glass = false, surface?: ConceptSurface, maxGroundEdge = 6) {
    geometry = this.onTerrain(geometry, maxGroundEdge)
    const plain = geometry.index ? geometry.toNonIndexed() : geometry
    if (plain !== geometry) geometry.dispose()
    this.tagBuilding(plain)
    // 꼭짓점 색은 0~255 정수로 담아 메모리를 줄입니다(선형 색 공간 값).
    const linear = new THREE.Color(color)
    const count = plain.getAttribute('position').count
    const colors = new Uint8Array(count * 3)
    const rgb = [Math.round(linear.r * 255), Math.round(linear.g * 255), Math.round(linear.b * 255)]
    for (let index = 0; index < count; index++) colors.set(rgb, index * 3)
    plain.setAttribute('color', new THREE.BufferAttribute(colors, 3, true))
    this.material(glass, surface).geometries.push(plain)
  }

  // 지금 만드는 건물의 번호를 도형의 모든 꼭짓점에 붙입니다(고리 묶음의 건물만). 첫 도형에서 번호를 받습니다.
  private tagBuilding(geometry: THREE.BufferGeometry) {
    if (this.group === 'scene') return
    if (this.currentBuilding < 0 && this.buildingContext && this.occluders.length < FADE_TEXTURE_SIZE * FADE_TEXTURE_SIZE) {
      this.currentBuilding = this.occluders.push(this.buildingContext) - 1
      this.occluderBases[this.currentBuilding] = this.buildingBase
    }
    const index = Math.max(0, this.currentBuilding)
    geometry.setAttribute('buildingIndex', new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count).fill(index), 1))
  }

  // 내 위치를 가리는 건물은 4×4 베이어 점무늬로 픽셀을 걸러 비치게 합니다. 섞어 그리지 않아 겹친 건물끼리
  // 그리는 순서가 꼬이지 않고, 지도 캔버스의 알파를 건드리지 않아 바탕이 하얗게 비치지도 않습니다.
  private patchFade(material: THREE.Material) {
    const size = `${FADE_TEXTURE_SIZE}.0`
    material.onBeforeCompile = (shader) => {
      shader.uniforms.buildingFade = this.fadeUniform
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float buildingIndex;\nvarying float vBuildingIndex;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBuildingIndex = buildingIndex;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D buildingFade;\nvarying float vBuildingIndex;')
        .replace('void main() {', [
          'void main() {',
          '  float fadeIndex = floor(vBuildingIndex + 0.5);',
          `  float fade = texture2D(buildingFade, vec2((mod(fadeIndex, ${size}) + 0.5) / ${size}, (floor(fadeIndex / ${size}) + 0.5) / ${size})).r;`,
          '  if (fade < 0.999) {',
          '    ivec2 cell = ivec2(mod(gl_FragCoord.xy, 4.0));',
          '    int bayer[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);',
          '    if ((float(bayer[cell.y * 4 + cell.x]) + 0.5) / 16.0 > fade) discard;',
          '  }',
        ].join('\n'))
    }
    material.customProgramCacheKey = () => 'building-fade'
  }

  // 간판·사진 외관처럼 따로 만드는 메시도 같은 건물과 함께 비치게 합니다.
  private fadeWithBuilding(mesh: THREE.Mesh) {
    if (this.group === 'scene') return
    this.tagBuilding(mesh.geometry)
    this.patchFade(mesh.material as THREE.Material)
  }

  // 카메라가 멈추거나 내 위치가 바뀌면 내 위치를 가리는 건물을 다시 고릅니다.
  private readonly scheduleOcclusion = () => {
    if (this.occlusionTimer) clearTimeout(this.occlusionTimer)
    this.occlusionTimer = setTimeout(() => this.updateOcclusion(), 120)
  }

  private updateOcclusion() {
    this.occlusionTimer = null
    const map = this.map
    if (!map) return
    // 모두 반투명하게 했거나 자동 반투명을 끈 경우에는 건물별로 고르지 않습니다.
    let next = new Set<number>()
    // 길을 가리는 건물 반투명(주석 처리, 2026-10-09):
    // if (this.autoSeeThrough && this.buildingOpacity >= 1) {
    //   this.roadIndex ??= new RoadIndex(buildRoadRuns(getStreetSceneBounds()).roadRuns)
    //   // 화면 긴 변만큼의 땅(지도 중심 기준 반경)에 있는 건물만 봅니다. 기울이면 위쪽이 더 멀리 보이므로 넉넉히 잡습니다.
    //   const center = map.getCenter()
    //   const metersPerPixel = 40075016.686 * Math.cos(center.lat * Math.PI / 180) / (512 * 2 ** map.getZoom())
    //   const canvas = map.getCanvas()
    //   const [x, z] = streetMeters([center.lng, center.lat])
    //   const radius = Math.max(canvas.clientWidth, canvas.clientHeight) * metersPerPixel * (1 + map.getPitch() / 60)
    //   next = findRoadOccluders(this.occluders, this.roadIndex, map.getBearing(), map.getPitch(), { x, z, radius })
    // }
    // 지금은 내 위치(GPS)를 가리는 근처 건물만 반투명하게 합니다. 위치를 모르면 아무 건물도 비치지 않습니다.
    if (this.autoSeeThrough && this.buildingOpacity >= 1 && this.myPosition) {
      // 지형에서는 건물 높이를 내 위치 땅 높이 기준으로 바꿔 셉니다(아래쪽 비탈의 건물은 나를 가리지 않음).
      const terrain = this.terrain, position = this.myPosition
      const occluders = terrain ? this.occluders.map((occluder, index) => ({
        ...occluder, height: Math.max(0, occluder.height + (this.occluderBases[index] ?? 0) - terrain.height(position[0], position[1])),
      })) : this.occluders
      next = findPointOccluders(occluders, position, map.getBearing(), map.getPitch())
    }
    const changed = next.size !== this.occluding.size || [...next].some((index) => !this.occluding.has(index))
    if (!changed) return
    this.occluding = next
    const fade = Math.round(STREET_FADE_OPACITY * 255)
    for (let index = 0; index < this.occluders.length; index++) this.fadeData[index * 4] = next.has(index) ? fade : 255
    this.fadeTexture.needsUpdate = true
    for (const split of this.fadeSplits) this.partition(split)
    map.triggerRepaint()
  }

  // 비치는 건물이 바뀐 메시만 인덱스를 다시 채웁니다: 앞쪽은 비치지 않는 건물, 뒤쪽은 비치는 건물.
  private partition(split: FadeSplit, force = false) {
    const { runs, state } = split
    let changed = force
    for (let run = 0; run < state.length; run++) {
      const fading = this.occluding.has(runs[run * 3]) ? 1 : 0
      if (state[run] !== fading) { state[run] = fading; changed = true }
    }
    if (!changed) return
    const array = split.index.array as Uint32Array
    let cursor = 0
    let plainCount = 0
    for (const wanted of [0, 1]) {
      if (wanted === 1) plainCount = cursor
      for (let run = 0; run < state.length; run++) {
        if (state[run] !== wanted) continue
        const start = runs[run * 3 + 1], end = start + runs[run * 3 + 2]
        for (let vertex = start; vertex < end; vertex++) array[cursor++] = vertex
      }
    }
    split.plain.geometry.setDrawRange(0, plainCount)
    split.fade.geometry.setDrawRange(plainCount, cursor - plainCount)
    // 그릴 것이 없는 쪽은 숨겨 빈 그리기 호출(재질·상태 전환)을 아낍니다.
    split.plain.visible = plainCount > 0
    split.fade.visible = cursor > plainCount
    split.index.needsUpdate = true
  }

  // 내 위치(경도·위도)를 알려 줍니다. 바뀌면 내 위치를 가리는 건물을 다시 고릅니다. null이면 모두 불투명.
  setMyPosition(position: [number, number] | null) {
    const next = position ? streetMeters(position) : null
    const current = this.myPosition
    if (!next && !current) return
    // GPS가 제자리에서 조금 흔들리는 정도(0.5m 미만)는 다시 계산하지 않습니다.
    if (next && current && Math.hypot(next[0] - current[0], next[1] - current[1]) < 0.5) return
    this.myPosition = next
    this.scheduleOcclusion()
  }

  // 도로 바닥에 아직 구워지지 않은 골목길(배포 뒤 새로 추가하거나 고친 길)을 바닥 위에 골목길 포장으로 그립니다.
  // 구워진 골목길과 같은 모양(돌 테두리 + 베이지 포장)이지만, 그 위에 걸친 건물은 다음 배포 때 깎입니다.
  setExtraAlleys(alleys: Alley[]) {
    for (const mesh of this.extraAlleyMeshes) {
      mesh.removeFromParent()
      mesh.geometry.dispose()
    }
    this.extraAlleyMeshes = []
    const runs = alleys.filter((alley) => !isBakedAlley(alley)).map((alley) => ({
      points: alley.coordinates.map(streetMeters), width: alley.widthMeters, type: 'foot', gaps: [],
    }))
    if (runs.length) {
      this.extraAlleyTexture ??= conceptTexture('ground-stone')
      const layers: [polygonClipping.MultiPolygon, number, number][] = [
        [unionRoadAreas(roadOutlines(runs.map((run) => ({ ...run, width: run.width + ALLEY_EDGE })))), 0.052, 0xffffff],
        [unionRoadAreas(roadOutlines(runs)), 0.062, ALLEY_PAVING_COLOR],
      ]
      for (const [polygons, y, color] of layers) {
        const geometries = polygons.filter((polygon) => polygon[0]?.length >= 4).map((polygon) => {
          const shape = new THREE.Shape()
          polygon[0].forEach(([x, z], index) => index === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z))
          for (const ring of polygon.slice(1)) {
            const hole = new THREE.Path()
            ring.forEach(([x, z], index) => index === 0 ? hole.moveTo(x, -z) : hole.lineTo(x, -z))
            shape.holes.push(hole)
          }
          const geometry = new THREE.ShapeGeometry(shape)
          const uv = geometry.getAttribute('uv')
          for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 20, uv.getY(i) / 20)
          geometry.rotateX(-Math.PI / 2)
          geometry.translate(0, y, 0)
          return geometry
        })
        if (!geometries.length) continue
        const placed = geometries.map((geometry) => this.onTerrain(geometry))
        const mesh = new THREE.Mesh(mergeGeometries(placed), new THREE.MeshLambertMaterial({ color, map: this.extraAlleyTexture, depthWrite: !this.terrain }))
        placed.forEach((geometry) => geometry.dispose())
        mesh.receiveShadow = true
        mesh.frustumCulled = false
        if (this.terrain) mesh.renderOrder = TERRAIN_EXTRA_ALLEY_ORDER[this.extraAlleyMeshes.length % 2]
        this.scene.add(mesh)
        this.extraAlleyMeshes.push(mesh)
      }
    }
    this.map?.triggerRepaint()
  }

  // 켜져 있으면 지금 카메라에서 내 위치(GPS)를 가리는 근처 건물만 반투명하게 그립니다.
  setAutoSeeThrough(enabled: boolean) {
    this.autoSeeThrough = enabled
    this.scheduleOcclusion()
  }

  private box(color: number, width: number, height: number, depth: number, x: number, y: number, z: number, rotation = 0, glass = false, surface?: ConceptSurface) {
    if (width <= 0 || height <= 0 || depth <= 0) return
    // 상자를 수만 개 만들기 때문에 매번 BoxGeometry를 새로 짓지 않고 단위 상자를 복사해 늘립니다.
    // 면별 UV(0~1)와 축 방향 법선은 늘려도 그대로라 결과는 BoxGeometry(width, height, depth)와 같습니다.
    const geometry = UNIT_BOX.clone()
    geometry.scale(width, height, depth)
    // Keep brick courses at a physical scale rather than stretching one
    // texture over every facade, regardless of the building's dimensions.
    if (surface === 'lane-brick' || surface === 'workshop-brick' || surface === 'wood' || surface === 'district-facade') {
      const [tileWidth, tileHeight] = surface === 'lane-brick' ? [2.4, 1.2]
        : surface === 'wood' ? [1.2, 1.2] : surface === 'district-facade' ? [DISTRICT_BAY_WIDTH, DISTRICT_FLOOR_HEIGHT] : [1.44, 1.44]
      const uv = geometry.getAttribute('uv'), normal = geometry.getAttribute('normal')
      for (let i = 0; i < uv.count; i++) {
        const side = Math.abs(normal.getX(i)) > 0.5
        const top = Math.abs(normal.getY(i)) > 0.5
        uv.setXY(i, uv.getX(i) * (side ? depth : width) / tileWidth,
          uv.getY(i) * (top ? depth : height) / tileHeight + (top ? 0 : (y - height / 2) / tileHeight))
      }
    }
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation),
      new THREE.Vector3(1, 1, 1),
    )
    geometry.applyMatrix4(transform)
    this.addGeometry(color, geometry, glass, surface)
  }

  private roof(color: number, outline: [number, number][], height: number, surface?: ConceptSurface) {
    const shape = new THREE.Shape()
    outline.forEach(([x, z], index) => index === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z))
    shape.closePath()
    const geometry = new THREE.ShapeGeometry(shape)
    geometry.rotateX(-Math.PI / 2)
    geometry.translate(0, height + 0.05, 0)
    this.addGeometry(color, geometry, false, surface)
  }

  private roadArea(polygons: polygonClipping.MultiPolygon, y: number, color: number, surface?: ConceptSurface) {
    for (const polygon of polygons) {
      if (!polygon[0] || polygon[0].length < 4) continue
      const shape = new THREE.Shape()
      polygon[0].forEach(([x, z], index) => index === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z))
      for (const ring of polygon.slice(1)) {
        const hole = new THREE.Path()
        ring.forEach(([x, z], index) => index === 0 ? hole.moveTo(x, -z) : hole.lineTo(x, -z))
        shape.holes.push(hole)
      }
      const geometry = new THREE.ShapeGeometry(shape)
      const uv = geometry.getAttribute('uv')
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 20, uv.getY(i) / 20)
      geometry.rotateX(-Math.PI / 2)
      geometry.translate(0, y, 0)
      this.addGeometry(color, geometry, false, surface)
    }
  }

  // 바깥 면만 그리므로 면 방향을 맞춥니다: 눕거나 기운 면(지붕·바닥)은 위를, 선 면(창·박공 끝)은 지금 만드는
  // 건물의 바깥을 향하게 합니다. 아래에서 올려다볼 수 있는 면(차양)은 doubleSided로 양면을 그립니다.
  private quad(color: number, corners: [number, number, number][], surface?: ConceptSurface, doubleSided = false) {
    const [a, b, c, d] = corners
    const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    const normal = ab.cross(new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]))
    let flip = false
    if (Math.abs(normal.y) > 0.3 * normal.length()) flip = normal.y < 0
    else if (this.buildingContext) {
      const [cx, cz] = outlineCenter(this.buildingContext.outline)
      const mx = (a[0] + b[0] + c[0] + d[0]) / 4, mz = (a[2] + b[2] + c[2] + d[2]) / 4
      flip = normal.x * (mx - cx) + normal.z * (mz - cz) < 0
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(flip
      ? [...a, ...c, ...b, ...a, ...d, ...c] : [...a, ...b, ...c, ...a, ...c, ...d], 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(flip
      ? [0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1] : [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2))
    geometry.computeVertexNormals()
    const previous = this.doubleSided
    this.doubleSided ||= doubleSided
    this.addGeometry(color, geometry, false, surface)
    this.doubleSided = previous
  }

  // 벽 한 변을 바깥쪽으로 향한 얇은 면 하나(삼각형 2개)로 그립니다. 두께 있는 상자(삼각형 10개)와 달리
  // 안쪽·위·옆면이 없어 먼 동네처럼 벽 두께가 보이지 않는 곳에 씁니다. 질감 UV는 box()와 같은 실제 축척입니다.
  private wallFace(color: number, [ax, az]: [number, number], [bx, bz]: [number, number], nx: number, nz: number,
    offset: number, bottom: number, top: number, surface?: ConceptSurface) {
    const length = Math.hypot(bx - ax, bz - az)
    if (length <= 0 || top <= bottom) return
    const [tileWidth, tileHeight] = surface === 'lane-brick' ? [2.4, 1.2] : surface === 'wood' ? [1.2, 1.2]
      : surface === 'district-facade' ? [DISTRICT_BAY_WIDTH, DISTRICT_FLOOR_HEIGHT] : [0, 0]
    const u = tileWidth ? length / tileWidth : 1
    const [v0, v1] = tileHeight ? [bottom / tileHeight, top / tileHeight] : [0, 1]
    const ox = nx * offset, oz = nz * offset
    // 바깥(n) 쪽에서 볼 때 반시계 방향이 되도록 a→b가 n의 오른쪽으로 가게 맞춥니다.
    const flip = (bx - ax) * nz - (bz - az) * nx < 0
    const [p, q] = flip ? [[bx, bz], [ax, az]] : [[ax, az], [bx, bz]]
    const [u0, u1] = flip ? [u, 0] : [0, u]
    const geometry = new THREE.BufferGeometry()
    const a = [p[0] + ox, bottom, p[1] + oz], b = [q[0] + ox, bottom, q[1] + oz]
    const c = [q[0] + ox, top, q[1] + oz], d = [p[0] + ox, top, p[1] + oz]
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1], 2))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(Array(6).fill([nx, 0, nz]).flat(), 3))
    this.addGeometry(color, geometry, false, surface)
  }

  private beam(color: number, from: [number, number, number], to: [number, number, number], thickness: number) {
    const start = new THREE.Vector3(...from)
    const end = new THREE.Vector3(...to)
    const vector = end.clone().sub(start)
    if (vector.length() < 0.04) return
    const geometry = UNIT_BEAM.clone()
    geometry.scale(thickness, vector.length(), thickness)
    geometry.applyMatrix4(new THREE.Matrix4().compose(
      start.add(end).multiplyScalar(0.5),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.normalize()),
      new THREE.Vector3(1, 1, 1),
    ))
    this.addGeometry(color, geometry)
  }

  private shade(color: number, factor: number) {
    return new THREE.Color(color).multiplyScalar(factor).getHex()
  }

  private framedWindow(
    x: number, y: number, z: number, rotation: number, nx: number, nz: number,
    width: number, height: number, lightFrame: boolean,
  ) {
    const frame = lightFrame ? 0xe6e6dd : 0x46595e
    this.box(0x344b53, width + 0.16, height + 0.16, 0.055, x, y, z, rotation, true)
    this.box(0x7799a2, width - 0.12, height - 0.12, 0.018, x + nx * 0.045, y, z + nz * 0.045, rotation, true)
    for (const edge of [-1, 1]) {
      const dx = Math.cos(rotation) * width * 0.5 * edge
      const dz = -Math.sin(rotation) * width * 0.5 * edge
      this.box(frame, 0.065, height + 0.18, 0.09, x + dx + nx * 0.06, y, z + dz + nz * 0.06, rotation)
    }
    this.box(frame, width + 0.16, 0.065, 0.09, x + nx * 0.06, y + height / 2 + 0.045, z + nz * 0.06, rotation)
    this.box(frame, width + 0.16, 0.065, 0.09, x + nx * 0.06, y - height / 2 - 0.045, z + nz * 0.06, rotation)
    this.box(frame, 0.045, height, 0.08, x + nx * 0.065, y, z + nz * 0.065, rotation)
    this.box(frame, width, 0.045, 0.08, x + nx * 0.065, y - height * 0.1, z + nz * 0.065, rotation)
    this.box(0xd8d7cb, width + 0.24, 0.105, 0.22, x + nx * 0.08, y - height / 2 - 0.12, z + nz * 0.08, rotation)
  }

  private shopDoor(x: number, z: number, rotation: number, nx: number, nz: number, shutter: boolean) {
    this.box(0x33464a, 0.94, 2.12, 0.08, x, 1.26, z, rotation)
    this.box(shutter ? 0x8fa3a7 : 0x61818a, 0.76, 1.94, 0.025, x + nx * 0.065, 1.27, z + nz * 0.065, rotation, true)
    this.box(0xd5d6ca, 0.055, 2.15, 0.09, x + Math.cos(rotation) * 0.48, 1.26, z - Math.sin(rotation) * 0.48, rotation)
    this.box(0xe6c77f, 0.045, 0.2, 0.075, x + Math.cos(rotation) * 0.27 + nx * 0.1, 1.16, z - Math.sin(rotation) * 0.27 + nz * 0.1, rotation)
    this.box(0xb7b5aa, 1.22, 0.12, 0.42, x + nx * 0.19, 0.12, z + nz * 0.19, rotation)
  }

  private houseDoor(x: number, z: number, rotation: number, nx: number, nz: number, color: number) {
    this.box(0xf3f3ea, 1.16, 2.15, 0.1, x, 1.21, z, rotation)
    this.box(color, 0.98, 1.98, 0.045, x + nx * 0.07, 1.19, z + nz * 0.07, rotation)
    this.box(0x789ba3, 0.61, 0.48, 0.025, x + nx * 0.105, 1.72, z + nz * 0.105, rotation, true)
    this.box(0xe8e4d8, 0.7, 0.04, 0.06, x + nx * 0.13, 1.45, z + nz * 0.13, rotation)
    this.box(0xc3a66b, 0.045, 0.17, 0.045,
      x + Math.cos(rotation) * 0.34 + nx * 0.12, 1.13,
      z - Math.sin(rotation) * 0.34 + nz * 0.12, rotation)
    this.box(0xd9ded7, 1.34, 0.1, 0.48, x + nx * 0.26, 0.11, z + nz * 0.26, rotation)
  }

  private detailedRoof(color: number, wallColor: number, outline: [number, number][], height: number, id: number, roofStyle: 'flat' | 'gable', shallowSheetRoof = false, restrainedRoof = false, flatSurface?: ConceptSurface, observedPitch = false, rimBeams = true) {
    let longest = { length: 0, unit: [1, 0] as [number, number] }
    for (let index = 0; index < outline.length; index++) {
      const a = outline[index]
      const b = outline[(index + 1) % outline.length]
      const dx = b[0] - a[0]
      const dz = b[1] - a[1]
      const length = Math.hypot(dx, dz)
      if (length > longest.length) longest = { length, unit: [dx / length, dz / length] }
    }
    const [ux, uz] = longest.unit
    const [vx, vz] = [-uz, ux]
    const u = outline.map(([x, z]) => x * ux + z * uz)
    const v = outline.map(([x, z]) => x * vx + z * vz)
    const minU = Math.min(...u)
    const maxU = Math.max(...u)
    const minV = Math.min(...v)
    const maxV = Math.max(...v)
    const length = maxU - minU
    const width = maxV - minV
    const area = polygonArea(outline)
    const regular = isSafeGableOutline(outline)
    const pitched = roofStyle === 'gable' && regular && length > (observedPitch ? 4 : 5.5) && width > 2.8 && (observedPitch || length / width > 1.15)
    if (!pitched) {
      this.roof(color, outline, height, flatSurface)
      for (let index = 0; index < outline.length; index++) {
        const [ax, az] = outline[index]
        const [bx, bz] = outline[(index + 1) % outline.length]
        const edgeLength = Math.hypot(bx - ax, bz - az)
        if (edgeLength < 0.3 || !rimBeams) continue
        this.beam(0xe6e2d9, [ax, height + 0.14, az], [bx, height + 0.14, bz], 0.18)
        // 난간 위 가는 선은 가까운 건물에만 둡니다(먼 동네는 지도 축척에서 보이지 않음).
        if (!restrainedRoof) this.beam(0x73817e, [ax, height + 0.22, az], [bx, height + 0.22, bz], 0.035)
        if (!restrainedRoof && area > 42 && id % 6 === 1 && edgeLength > 2.5) {
          this.beam(0x6f7e7d, [ax, height + 0.9, az], [bx, height + 0.9, bz], 0.055)
          for (let distance = 0; distance < edgeLength; distance += 1.45) {
            const t = distance / edgeLength
            const x = ax + (bx - ax) * t
            const z = az + (bz - az) * t
            this.beam(0x6f7e7d, [x, height + 0.22, z], [x, height + 0.9, z], 0.05)
          }
        }
      }
      if (!restrainedRoof && area > 35) {
        const x = outline.reduce((sum, point) => sum + point[0], 0) / outline.length
        const z = outline.reduce((sum, point) => sum + point[1], 0) / outline.length
        if (id % 3 === 0) {
          this.box(0xc9ceca, 0.85, 0.55, 0.75, x, height + 0.32, z)
          this.box(0x737f7d, 0.72, 0.05, 0.64, x, height + 0.62, z)
          for (const offset of [-0.23, 0, 0.23]) this.box(0x7f8b88, 0.035, 0.36, 0.02, x + offset, height + 0.31, z + 0.39)
        }
        if (id % 4 === 0) {
          this.box(0x708f91, 1.35, 0.12, 0.9, x + 0.9, height + 0.18, z - 0.75)
          this.box(0xc4d6d6, 1.2, 0.015, 0.75, x + 0.9, height + 0.25, z - 0.75)
        }
        if (id % 5 === 0) {
          this.box(0x9fa7a2, 0.9, 0.75, 0.8, x - 0.85, height + 0.42, z + 0.6)
          this.box(0x657370, 0.68, 0.53, 0.025, x - 0.85, height + 0.42, z + 1.02)
        }
      }
      return
    }

    const midV = (minV + maxV) / 2
    const rise = Math.min(shallowSheetRoof ? 0.85 : 2, width * (shallowSheetRoof ? 0.14 : 0.28))
    const point = (along: number, across: number, y: number): [number, number, number] => [
      along * ux + across * vx,
      y,
      along * uz + across * vz,
    ]
    const trim = shallowSheetRoof ? this.shade(color, 1.08) : 0xe1edf0
    for (const edgeV of [minV, maxV]) {
      this.quad(color, [
        point(minU - 0.15, edgeV, height),
        point(maxU + 0.15, edgeV, height),
        point(maxU + 0.15, midV, height + rise),
        point(minU - 0.15, midV, height + rise),
      ], 'roof-sheet')
      this.beam(trim, point(minU - 0.16, edgeV, height + 0.025), point(maxU + 0.16, edgeV, height + 0.025), 0.055)
      // 골강판 골은 roof-sheet 텍스처에도 그려져 있으므로, 입체 골(0.6m마다)은 가까운 건물에만 붙입니다.
      if (!restrainedRoof) for (let along = minU + 0.4; along < maxU; along += 0.6) {
        this.beam(trim, point(along, edgeV, height + 0.04), point(along, midV, height + rise + 0.04), 0.025)
      }
    }
    this.beam(trim, point(minU - 0.16, midV, height + rise + 0.025), point(maxU + 0.16, midV, height + rise + 0.025), 0.055)
    for (const edgeU of [minU, maxU]) {
      this.beam(0x637d82, point(edgeU, minV, height), point(edgeU, midV, height + rise), 0.1)
      this.beam(0x637d82, point(edgeU, maxV, height), point(edgeU, midV, height + rise), 0.1)
    }
    for (const edgeU of [minU, maxU]) {
      this.quad(wallColor, [
        point(edgeU, minV, height),
        point(edgeU, maxV, height),
        point(edgeU, midV, height + rise),
        point(edgeU, midV, height + rise),
      ])
    }
  }

  private tree(x: number, z: number, height: number, blossoms: boolean) {
    const trunk = new THREE.CylinderGeometry(0.105, 0.17, height * 0.58, 6, 1, true)
    trunk.translate(x, height * 0.29, z)
    this.addGeometry(0x78664f, trunk)
    for (const [ox, oy, oz, radius, tone] of [
      [0, 0.83, 0, 0.3, 0], [-0.22, 0.7, 0.07, 0.2, 1],
      [0.2, 0.69, -0.12, 0.22, 2], [0.04, 0.57, 0.21, 0.17, 1],
      [-0.1, 0.95, -0.06, 0.18, 2],
    ] as const) {
      // 지도 축척에서는 세분 1단계(80면)로도 둥글게 보입니다(2단계는 320면).
      const foliage = new THREE.IcosahedronGeometry(height * radius, 1)
      foliage.translate(x + ox * height, height * oy, z + oz * height)
      this.addGeometry(blossoms ? [0xe4bec4, 0xd6a6b2, 0xefd0ce][tone] : [0x658761, 0x75996e, 0x8cab77][tone], foliage)
    }
  }

  private planter(x: number, z: number, blossoms: boolean) {
    this.box(0x827d69, 0.82, 0.34, 0.5, x, 0.22, z)
    this.box(0x514f3d, 0.7, 0.035, 0.4, x, 0.41, z)
    for (const offset of [-0.23, 0, 0.23]) {
      const crown = new THREE.IcosahedronGeometry(offset === 0 ? 0.31 : 0.25, 1)
      crown.translate(x + offset, 0.71 + (offset === 0 ? 0.07 : 0), z)
      this.addGeometry(blossoms ? 0xc98396 : 0x688465, crown)
    }
  }

  private landscape(buildings: StreetBuilding[]) {
    const polygons = buildings.map((building) => building.outline.map(streetMeters))
    const occupied = (x: number, z: number) => polygons.some((polygon) => {
      let inside = false
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, zi] = polygon[i]
        const [xj, zj] = polygon[j]
        if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside
      }
      return inside
    })
    // The filmed commercial lane is dense and mostly paved. Planting is
    // concentrated at the bend and on the open side near the workshop.
    for (const [longitude, latitude, height, blossoms] of [
      [129.00882, 35.09539, 2.8, false],
      [129.00923, 35.09530, 3.6, false],
      [129.00939, 35.09539, 3.2, true],
    ] as const) {
      const [x, z] = streetMeters([longitude, latitude])
      if (!occupied(x, z)) this.tree(x, z, height, blossoms)
    }
    for (const [index, t, side, blossoms] of [
      [1, 0.35, -1, true], [2, 0.28, 1, false],
      [3, 0.65, -1, true], [4, 0.36, 1, true],
      [5, 0.72, -1, false],
    ] as const) {
      const a = streetMeters(PHOTOGRAPHED_STREET[index])
      const b = streetMeters(PHOTOGRAPHED_STREET[index + 1])
      const dx = b[0] - a[0]
      const dz = b[1] - a[1]
      const length = Math.hypot(dx, dz)
      if (length < 4) continue
      const x = a[0] + dx * t - dz / length * 3.75 * side
      const z = a[1] + dz * t + dx / length * 3.75 * side
      if (!occupied(x, z)) this.planter(x, z, blossoms)
    }
    const bounds = getStreetSceneBounds()
    for (const area of STREET_SURFACE_WAYS.green) {
      const polygon = clipPolygonToBounds(area.points.map(streetMeters), bounds)
      if (polygon.length < 3) continue
      const minX = Math.min(...polygon.map(([x]) => x))
      const maxX = Math.max(...polygon.map(([x]) => x))
      const minZ = Math.min(...polygon.map(([, z]) => z))
      const maxZ = Math.max(...polygon.map(([, z]) => z))
      const spacing = Math.max(12, Math.sqrt((maxX - minX) * (maxZ - minZ) / 100))
      for (let x = minX + 3; x < maxX - 2; x += spacing) for (let z = minZ + 3; z < maxZ - 2; z += spacing) {
        const tx = x + Math.sin(x * 1.71 + z * 0.83) * 2.2
        const tz = z + Math.cos(x * 0.64 - z * 1.39) * 2.2
        let inside = false
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
          const [xi, zi] = polygon[i]
          const [xj, zj] = polygon[j]
          if ((zi > tz) !== (zj > tz) && tx < (xj - xi) * (tz - zi) / (zj - zi) + xi) inside = !inside
        }
        if (inside && !occupied(tx, tz)) this.tree(tx, tz, 2.7 + (Math.abs(tx + tz) % 1.2), Math.sin(tx * 0.8 + tz * 1.3) > 0.72)
      }
    }
  }

  private buildGroundAndSideRoads(buildings: StreetBuilding[]) {
    const bounds = getStreetSceneBounds()
    const width = bounds.maxX - bounds.minX
    const depth = bounds.maxZ - bounds.minZ
    const cx = (bounds.minX + bounds.maxX) / 2
    const cz = (bounds.minZ + bounds.maxZ) / 2
    // The solid base belongs only to the flat map. On sloped terrain, moving
    // this scene-wide box to one sampled height makes it bury downhill blocks.
    if (!this.terrain) this.box(0xd1ddd3, width, 0.85, depth, cx, -0.455, cz)
    // 지형에서는 길과 바닥판을 휴대폰 메모리에 맞게 6m 단위로 굵게 나눠 얹으므로, 굽은 비탈에서 두 면의 높이가
    // 수십 cm까지 어긋납니다. 바닥판을 길보다 0.5m 아래에 깔아 길 위로 뚫고 올라오지 않게 합니다.
    // (길을 2.5m로 잘게 나누면 꼭짓점이 3.5배로 늘어 브라우저가 메모리 부족으로 멈췄습니다.)
    this.box(0xffffff, width, 0.035, depth, cx, this.terrain ? -0.5 : -0.012, cz, 0, false, 'ground-pavers')
    for (const [x, z, alongX, length] of [
      [cx, bounds.minZ, true, width], [cx, bounds.maxZ, true, width],
      [bounds.minX, cz, false, depth], [bounds.maxX, cz, false, depth],
    ] as const) {
      this.box(0xd6e0d7, length, 0.12, 0.16, x, -0.015, z, alongX ? 0 : Math.PI / 2)
    }

    // OSM woodland polygons mark the few genuinely open parcels. Clip their
    // geometry to the modeled slab instead of extending them into the map.
    for (const area of STREET_SURFACE_WAYS.green) {
      const polygon = clipPolygonToBounds(area.points.map(streetMeters), bounds)
      if (polygon.length >= 3) this.roof(0xffffff, polygon, -0.034, 'ground-grass')
      if (area.id === 1468551467) for (let i = 0; i < polygon.length; i++) {
        const [ax, az] = polygon[i]
        const [bx, bz] = polygon[(i + 1) % polygon.length]
        if (Math.hypot(bx - ax, bz - az) < 0.6) continue
        this.beam(0xaaa79d, [ax, 0.2, az], [bx, 0.2, bz], 0.32)
        this.beam(0xd0cbc0, [ax, 0.41, az], [bx, 0.41, bz], 0.14)
      }
    }

    // Narrow stone aprons make each footprint meet the ground as a parcel,
    // without inventing fences or courtyards for unphotographed addresses.
    for (const building of buildings) {
      const outline = building.outline.map(streetMeters)
      this.roof(0xd8ded8, outline.map(([x, z]) => [x + 0.55, z + 0.75]), -0.039, this.terrain ? 'ground-pavers' : undefined)
      const [centerX, centerZ] = outlineCenter(outline)
      for (let i = 0; i < outline.length; i++) {
        const [ax, az] = outline[i]
        const [bx, bz] = outline[(i + 1) % outline.length]
        const dx = bx - ax
        const dz = bz - az
        const length = Math.hypot(dx, dz)
        if (length < 0.7) continue
        const mx = (ax + bx) / 2
        const mz = (az + bz) / 2
        const distance = Math.hypot(mx - centerX, mz - centerZ) || 1
        // 바닥 띠는 윗면만 보이므로 상자 대신 납작한 면 하나(삼각형 2개)로 깝니다.
        const ox = (mx - centerX) / distance * 0.38, oz = (mz - centerZ) / distance * 0.38
        const ux = dx / length * (length + 0.4) / 2, uz = dz / length * (length + 0.4) / 2
        const wx = -dz / length * 0.34, wz = dx / length * 0.34
        const cxApron = mx + ox, czApron = mz + oz
        this.quad(0xffffff, [
          [cxApron - ux - wx, 0.023, czApron - uz - wz], [cxApron + ux - wx, 0.023, czApron + uz - wz],
          [cxApron + ux + wx, 0.023, czApron + uz + wz], [cxApron - ux + wx, 0.023, czApron - uz + wz],
        ], 'ground-stone')
      }
    }

    // 도로·보도 면은 미리 계산한 저장본을 그립니다(roadGround.ts, npm run build:road-ground).
    const ground = ROAD_GROUND
    this.roadArea(ground.outer, 0.05, 0xffffff, 'ground-stone')
    this.roadArea(ground.roads, 0.07, 0xffffff, 'ground-lane')
    // 골목길은 차도와 구별되는 따뜻한 베이지 포장으로 그리고, 차도보다 살짝 낮게 깔아 교차하는 곳에서는 차도가
    // 위로 보이게 합니다. 가장자리에는 아래 돌 포장(outer)이 밝은 테두리로 드러납니다.
    this.roadArea(ground.footways, 0.06, ALLEY_PAVING_COLOR, 'ground-stone')
  }

  private sign(text: string, x: number, y: number, z: number, rotation: number, nx: number, nz: number, width: number, color: string) {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 160
    const context = canvas.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = color
    context.font = `bold ${text.length > 12 ? 74 : 96}px "Malgun Gothic", sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(text, 512, 82, 965)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const geometry = new THREE.PlaneGeometry(width, 0.44)
    geometry.rotateY(facingRotation(rotation, nx, nz))
    geometry.translate(x + nx * 0.04, y, z + nz * 0.04)
    this.onTerrain(geometry)
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false, forceSinglePass: true }))
    this.fadeWithBuilding(mesh)
    mesh.frustumCulled = false
    mesh.renderOrder = 4
    this.signMeshes.push(mesh)
    this.signTextures.push(texture)
    this.currentParent().add(mesh)
  }

  private paintedCloud(x: number, y: number, z: number, rotation: number, nx: number, nz: number) {
    const canvas = document.createElement('canvas')
    canvas.width = 256; canvas.height = 128
    const context = canvas.getContext('2d')
    if (!context) return
    context.fillStyle = '#eff5ef'
    for (const [cx, cy, rx, ry] of [[78, 76, 46, 25], [118, 56, 37, 35], [156, 67, 39, 29], [188, 80, 28, 20]]) {
      context.beginPath(); context.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); context.fill()
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const geometry = new THREE.PlaneGeometry(1.25, 0.63)
    geometry.rotateY(facingRotation(rotation, nx, nz))
    geometry.translate(x + nx * 0.18, y, z + nz * 0.18)
    this.onTerrain(geometry)
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false, forceSinglePass: true }))
    this.fadeWithBuilding(mesh)
    mesh.renderOrder = 4
    this.signMeshes.push(mesh); this.signTextures.push(texture); this.currentParent().add(mesh)
  }

  // 사진 시안 건물의 정면을 코드로 그립니다: 1층 가게 통창(분홍 주택은 문과 창)과 위층 창.
  // 간판·차양처럼 튀어나온 요소는 modelConceptFront가 덧붙입니다.
  private conceptFrontOpenings(
    kind: FacadeKind, x: number, z: number, rotation: number,
    dx: number, dz: number, nx: number, nz: number, length: number, height: number,
  ) {
    const at = (along: number, outward: number): [number, number] => [x + dx * along + nx * outward, z + dz * along + nz * outward]
    if (kind === 'pink') {
      const [doorX, doorZ] = at(-length * 0.22, 0.13)
      this.houseDoor(doorX, doorZ, rotation, nx, nz, 0xe9e6dc)
      const [windowX, windowZ] = at(length * 0.18, 0.13)
      this.framedWindow(windowX, 1.65, windowZ, rotation, nx, nz, Math.min(1.5, length * 0.3), 1.2, true)
    } else {
      // 가게 통창: 어두운 틀 안에 유리 세 칸
      const width = length * (kind === 'fofos' ? 0.7 : 0.82)
      const frame = kind === 'fofos' ? 0x4b3a2c : kind === 'mart' ? 0x2f3b3f : 0x3a3f40
      const [frameX, frameZ] = at(0, 0.13)
      this.box(frame, width + 0.2, 2.45, 0.08, frameX, 1.3, frameZ, rotation)
      const panes = 3
      for (let pane = 0; pane < panes; pane++) {
        const offset = (pane - (panes - 1) / 2) * (width / panes)
        const [paneX, paneZ] = at(offset, 0.18)
        this.box(0x8fb0b5, width / panes - 0.12, 2.2, 0.03, paneX, 1.25, paneZ, rotation, true)
      }
    }
    const stories = kind === 'mart' || kind === 'soup' || kind === 'chinese' ? 2 : 1
    for (let story = 0; story < stories; story++) {
      const y = 4.38 + story * 2.72
      if (y + 0.7 >= height) continue
      const count = kind === 'chinese' ? 3 : 2
      const spacing = Math.min(kind === 'mart' ? 3.1 : 2.35, length / count)
      const width = Math.min(kind === 'mart' ? 2.6 : 1.65, spacing - 0.4)
      if (width <= 0.5) continue
      for (let pane = 0; pane < count; pane++) {
        const [wx, wz] = at((pane - (count - 1) / 2) * spacing, 0.25)
        this.framedWindow(wx, y, wz, rotation, nx, nz, width, kind === 'mart' ? 1.24 : 1.18,
          kind === 'soup' || kind === 'chinese' || kind === 'pink')
      }
    }
  }

  private modelConceptFront(
    kind: FacadeKind, x: number, z: number, rotation: number,
    dx: number, dz: number, nx: number, nz: number, length: number,
  ) {
    const at = (along: number, outward: number): [number, number] => [
      x + dx * length * along + nx * outward,
      z + dz * length * along + nz * outward,
    ]
    const piece = (color: number, along: number, y: number, width: number, partHeight: number, depth: number, outward = 0.28) => {
      const [px, pz] = at(along, outward)
      this.box(color, width, partHeight, depth, px, y, pz, rotation)
    }
    const canopy = (color: number, yBack: number, yFront: number, projection: number, fraction = 0.96) => {
      const left = at(-fraction / 2, 0.27)
      const right = at(fraction / 2, 0.27)
      const frontLeft = at(-fraction / 2, projection)
      const frontRight = at(fraction / 2, projection)
      this.quad(color, [
        [left[0], yBack, left[1]], [right[0], yBack, right[1]],
        [frontRight[0], yFront, frontRight[1]], [frontLeft[0], yFront, frontLeft[1]],
      ])
      this.beam(this.shade(color, 0.72), [frontLeft[0], yFront, frontLeft[1]], [frontRight[0], yFront, frontRight[1]], 0.09)
    }

    if (kind === 'soup' || kind === 'chinese') {
      const signY = kind === 'soup' ? 3.03 : 3.48
      piece(kind === 'chinese' ? 0xa52b38 : 0xeee9df, 0, signY,
        length * (kind === 'soup' ? 0.87 : 0.52), kind === 'soup' ? 0.6 : 0.68, 0.15, 0.28)
      canopy(kind === 'soup' ? 0x98675c : 0x9a3037,
        kind === 'soup' ? 2.58 : 2.98, kind === 'soup' ? 2.22 : 2.43, 1.18)
      const backY = kind === 'soup' ? 2.58 : 2.98
      const frontY = kind === 'soup' ? 2.22 : 2.43
      for (const u of [-0.3, 0.3]) {
        const [px, pz] = at(u, 0.53)
        this.beam(0x454b48, [px, backY, pz], [px + nx * 0.65, frontY, pz + nz * 0.65], 0.045)
      }
      if (kind === 'chinese') {
        const [leftX, leftZ] = at(-0.13, 0.45)
        const [rightX, rightZ] = at(0.13, 0.45)
        this.beam(0x24272a, [leftX, 4.12, leftZ], [rightX, 4.12, rightZ], 0.07)
        for (const u of [-0.13, -0.065, 0, 0.065, 0.13]) {
          const [px, pz] = at(u, 0.45)
          this.beam(0x24272a, [px, 3.65, pz], [px, 4.12, pz], 0.045)
        }
        piece(0x353232, 0, 3.66, length * 0.29, 0.1, 0.4, 0.44)
      }
    } else if (kind === 'mart') {
      piece(0xe3e4db, 0, 4.92, length * 0.81, 0.67, 0.15, 0.28)
      canopy(0x3372ad, 4.22, 3.55, 1.42)
      for (const u of [-0.39, 0.39]) {
        const [px, pz] = at(u, 0.35)
        this.beam(0x5b6260, [px, 4.2, pz], [px + nx * 1.05, 3.55, pz + nz * 1.05], 0.05)
      }
    } else if (kind === 'handmade') {
      piece(0xf0eee5, 0.03, 3.2, length * 0.84, 0.67, 0.14, 0.27)
      canopy(0x437456, 2.82, 2.45, 1.05, 0.59)
      for (let u = -0.27; u < 0.3; u += 0.12) {
        const back = at(u, 0.32)
        const front = at(u, 1.05)
        this.beam(0xf2efe5, [back[0], 2.82, back[1]], [front[0], 2.45, front[1]], 0.06)
      }
    } else if (kind === 'fofos') {
      for (const u of [-0.46, -0.18, 0.17, 0.46]) piece(0x8b603e, u, 2.4, 0.12, 4.75, 0.28)
      canopy(0xc8d1ce, 5.4, 4.8, 0.9, 0.72)
      canopy(0x986c45, 3.37, 2.46, 1.14, 0.72)
      for (const u of [-0.34, 0, 0.34]) {
        const [px, pz] = at(u, 0.98)
        this.beam(0x6e4b31, [px, 2.46, pz], [px - nx * 0.5, 3.37, pz - nz * 0.5], 0.07)
      }
    }
  }

  private buildConceptBuilding(building: StreetBuilding, outline: [number, number][]) {
    const kind = building.concept!
    const height = building.heightMeters
    const wall = building.wallColor
    const [centerX, centerZ] = outlineCenter(outline)
    const edge = outline.map(([ax, az], index) => {
      const [bx, bz] = outline[(index + 1) % outline.length]
      const length = Math.hypot(bx - ax, bz - az)
      const midpoint: [number, number] = [
        (building.outline[index][0] + building.outline[(index + 1) % outline.length][0]) / 2,
        (building.outline[index][1] + building.outline[(index + 1) % outline.length][1]) / 2,
      ]
      return { ax, az, bx, bz, length, distance: nearestStreet(midpoint).distanceMeters }
    })
    const front = edge.reduce((best, current, index) => current.length > 2.4 && current.distance < edge[best].distance ? index : best, 0)

    if (kind === 'pink') this.detailedRoof(building.roofColor, wall, outline, height, building.id, 'gable')
    else {
      this.roof(0xffffff, outline, height, 'concrete')
      for (const side of edge) {
        const trim = kind === 'fofos' ? 0xf0ece2 : this.shade(wall, 0.8)
        this.beam(trim, [side.ax, height + 0.18, side.az], [side.bx, height + 0.18, side.bz], 0.18)
        if (kind !== 'fofos' && side.length > 0.5) {
          const rotation = -Math.atan2(side.bz - side.az, side.bx - side.ax)
          const parapetSurface: ConceptSurface = kind === 'mart' ? 'lime-rib' : kind === 'handmade' ? 'white-brick' : 'brick'
          this.box(0xffffff, side.length, 0.47, 0.22,
            (side.ax + side.bx) / 2, height + 0.25, (side.az + side.bz) / 2, rotation, false, parapetSurface)
          this.beam(0xe4e3d9, [side.ax, height + 0.53, side.az], [side.bx, height + 0.53, side.bz], 0.075)
        }
      }
      if (kind === 'fofos') for (const side of edge) {
        const length = side.length
        if (length < 0.5) continue
        this.beam(0xeae9e4, [side.ax, height + 1.12, side.az], [side.bx, height + 1.12, side.bz], 0.055)
        for (let distance = 0; distance <= length; distance += 1.2) {
          const t = distance / length
          const x = side.ax + (side.bx - side.ax) * t
          const z = side.az + (side.bz - side.az) * t
          this.beam(0xeae9e4, [x, height + 0.19, z], [x, height + 1.12, z], 0.045)
        }
      }
      if (kind !== 'handmade') {
        const unit = kind === 'mart' ? 0x8fa64a : 0xb6b8b2
        this.box(unit, 0.95, 0.72, 0.78, centerX - 0.7, height + 0.43, centerZ)
        this.box(0x646f70, 0.76, 0.5, 0.025, centerX - 0.7, height + 0.42, centerZ + 0.4)
        for (let offset = -0.29; offset < 0.35; offset += 0.14) this.box(0x495a5b, 0.035, 0.42, 0.04, centerX - 0.7 + offset, height + 0.42, centerZ + 0.43)
      }
      if (kind === 'mart') {
        this.box(0x9ab936, 1.65, 1.25, 1.42, centerX + 0.6, height + 0.68, centerZ)
        this.box(0x59665a, 0.82, 0.92, 0.06, centerX + 0.6, height + 0.62, centerZ + 0.74)
        this.box(0xe7e7dc, 1.76, 0.08, 1.53, centerX + 0.6, height + 1.34, centerZ)
      }
      if (kind === 'fofos') {
        const side = edge[(front + 1) % edge.length]
        if (side.length > 3.5) {
          const sideRotation = -Math.atan2(side.bz - side.az, side.bx - side.ax)
          const normalX = ((side.ax + side.bx) / 2 - centerX) / (Math.hypot((side.ax + side.bx) / 2 - centerX, (side.az + side.bz) / 2 - centerZ) || 1)
          const normalZ = ((side.az + side.bz) / 2 - centerZ) / (Math.hypot((side.ax + side.bx) / 2 - centerX, (side.az + side.bz) / 2 - centerZ) || 1)
          const count = 12
          for (let index = 0; index < count; index++) {
            const t = (index + 0.5) / count
            const x = side.ax + (side.bx - side.ax) * t + normalX * 0.76
            const z = side.az + (side.bz - side.az) * t + normalZ * 0.76
            this.box(0x353331, 0.82, 0.1, 0.91, x, height * t, z, sideRotation)
          }
          this.beam(0x282a2a,
            [side.ax + normalX * 1.15, 0.85, side.az + normalZ * 1.15],
            [side.bx + normalX * 1.15, height + 0.85, side.bz + normalZ * 1.15], 0.075)
          this.beam(0x282a2a,
            [side.ax + normalX * 0.38, 0.85, side.az + normalZ * 0.38],
            [side.bx + normalX * 0.38, height + 0.85, side.bz + normalZ * 0.38], 0.075)
        }
      }
    }

    for (const [index, side] of edge.entries()) {
      const { ax, az, bx, bz, length } = side
      if (length < 0.2) continue
      const dx = (bx - ax) / length
      const dz = (bz - az) / length
      const x = (ax + bx) / 2
      const z = (az + bz) / 2
      const rotation = -Math.atan2(bz - az, bx - ax)
      const outerLength = Math.hypot(x - centerX, z - centerZ) || 1
      const nx = (x - centerX) / outerLength
      const nz = (z - centerZ) / outerLength
      const fx = x + nx * 0.15
      const fz = z + nz * 0.15
      const isFront = index === front

      const surface: ConceptSurface = kind === 'soup' || kind === 'chinese' ? 'brick'
        : kind === 'handmade' ? 'white-brick' : kind === 'mart' ? 'lime-rib'
          : kind === 'fofos' ? 'wood' : 'pink-plaster'
      this.box(0xffffff, length, height, 0.22, x, height / 2, z, rotation, false, surface)
      this.box(this.shade(wall, 0.73), length, 0.38, 0.24, x, 0.2, z, rotation)
      if (kind === 'mart' && !isFront) for (const y of [3.35, 6.15]) this.box(0x738b3d, length, 0.1, 0.28, x, y, z, rotation)
      if (kind === 'pink' && !isFront) {
        for (const y of [3.1, height - 0.32]) this.box(0xc48f88, length, 0.09, 0.25, x, y, z, rotation)
      }

      if (isFront) {
        this.conceptFrontOpenings(kind, x, z, rotation, dx, dz, nx, nz, length, height)
        this.modelConceptFront(kind, x, z, rotation, dx, dz, nx, nz, length)
        if (kind !== 'pink' && kind !== 'fofos') {
          const signs = {
            soup: ['사골 소머리곰탕', '#302d2a', 3.03, 0.78],
            chinese: ['문화반점', '#fff1d7', 3.48, 0.47],
            mart: ['서원탑마트', '#283c30', 4.92, 0.72],
            handmade: ['별지음 · 핸드메이드', '#477461', 3.2, 0.75],
          } as const
          const [text, color, signY, width] = signs[kind]
          this.sign(text, fx + nx * 0.2, signY, fz + nz * 0.2,
            rotation, nx, nz, Math.min(length * width, 6.4), color)
        }
        continue
      }

      const stories = kind === 'mart' || kind === 'soup' || kind === 'chinese' ? 2 : 1
      for (let story = 0; story < stories; story++) {
        const y = 4.38 + story * 2.72
        if (y + 0.7 >= height) continue
        const count = kind === 'fofos' ? 3 : kind === 'mart' ? 2 : 2
        const width = Math.min(kind === 'mart' ? 2.6 : kind === 'fofos' ? 1.85 : 1.65, (length - 0.65) / count - 0.2)
        if (width <= 0.5) continue
        for (let pane = 0; pane < count; pane++) {
          const offset = (pane - (count - 1) / 2) * Math.min(kind === 'mart' ? 3.1 : 2.35, length / count)
          const wx = fx + dx * offset
          const wz = fz + dz * offset
          if (kind === 'mart') this.box(0x34454a, width + 0.22, 1.42, 0.1, wx, y, wz, rotation)
          if (kind === 'handmade') this.box(0x568265, width + 0.22, 1.46, 0.11, wx, y, wz, rotation)
          this.framedWindow(wx + nx * 0.1, y, wz + nz * 0.1, rotation, nx, nz,
            width, kind === 'mart' ? 1.24 : 1.18, kind === 'soup' || kind === 'chinese' || kind === 'pink')
        }
      }
    }
  }

  private buildObservedBuilding(building: StreetBuilding, outline: [number, number][]) {
    // 확인된 외관(영상·로드뷰)이 없으면 주변 확인 건물에서 빌린 추정 외관을 씁니다.
    const observed = building.observed ?? building.roadview ?? building.inferred!
    const height = building.heightMeters
    const [cx, cz] = outlineCenter(outline)
    const frontRoad = (building.roadview ?? building.inferred)?.frontRoad.map(streetMeters)
    const distanceToFrontRoad = ([x, z]: [number, number]) => {
      if (!frontRoad) return Infinity
      let distance = Infinity
      for (let index = 0; index < frontRoad.length - 1; index++) {
        distance = Math.min(distance, distanceToSegment(x, z, frontRoad[index], frontRoad[index + 1]))
      }
      return distance
    }
    const edges = outline.map(([ax, az], index) => {
      const [bx, bz] = outline[(index + 1) % outline.length]
      const length = Math.hypot(bx - ax, bz - az)
      const midpoint: [number, number] = [
        (building.outline[index][0] + building.outline[(index + 1) % outline.length][0]) / 2,
        (building.outline[index][1] + building.outline[(index + 1) % outline.length][1]) / 2,
      ]
      return { ax, az, bx, bz, length, streetDistance: frontRoad
        ? distanceToFrontRoad(streetMeters(midpoint)) : nearestStreet(midpoint).distanceMeters }
    })
    const sharedEdges = new Set(building.sharedEdges)
    const front = edges.reduce((best, edge, index) => !sharedEdges.has(index) && edge.length > 2.4
      && (best < 0 || edge.streetDistance < edges[best].streetDistance) ? index : best, -1)
    const surface: ConceptSurface = observed.surface === 'brick' ? 'lane-brick'
      : observed.surface === 'wood' ? 'wood' : 'lane-plaster'

    const roadview = building.roadview
    // The observed footprint retains its aerial roof colour, while the
    // photographed facades get individually authored openings and trim.
    if (roadview?.roofRailing || building.roofStyle === 'gable') {
      this.detailedRoof(building.roofColor, building.wallColor, outline, height,
        building.id, building.roofStyle, building.roofStyle === 'gable', true, 'roof-grain', building.roofStyle === 'gable')
    } else this.roof(building.roofColor, outline, height, 'concrete')
    for (const edge of edges) {
      if (edge.length < 0.2) continue
      this.beam(roadview?.parapetColor ?? 0xf0eee5,
        [edge.ax, height + 0.12, edge.az], [edge.bx, height + 0.12, edge.bz], 0.13)
      if (roadview?.roofRailing) {
        for (const y of [height + 0.45, height + 0.98]) this.beam(0x788b87,
          [edge.ax, y, edge.az], [edge.bx, y, edge.bz], 0.035)
        const count = Math.max(1, Math.ceil(edge.length / 0.8))
        for (let i = 0; i <= count; i++) {
          const x = edge.ax + (edge.bx - edge.ax) * i / count
          const z = edge.az + (edge.bz - edge.az) * i / count
          this.beam(0x788b87, [x, height + 0.2, z], [x, height + 1, z], 0.03)
        }
      }
    }
    for (const [index, edge] of edges.entries()) {
      const { ax, az, bx, bz, length } = edge
      if (length < 0.35) continue
      const x = (ax + bx) / 2
      const z = (az + bz) / 2
      const dx = (bx - ax) / length
      const dz = (bz - az) / length
      const rotation = -Math.atan2(bz - az, bx - ax)
      const outward = -dz * (x - cx) + dx * (z - cz) >= 0 ? 1 : -1
      const nx = -dz * outward
      const nz = dx * outward
      const isFront = index === front
      this.box(building.wallColor, length, height, 0.19, x, height / 2, z, rotation, false, surface)
      const lowerWallColor = roadview?.lowerWallColor ?? building.observed?.lowerWallColor
      if (lowerWallColor) {
        const lowerHeight = Math.min(height, roadview?.lowerWallHeight ?? 3.05)
        this.box(lowerWallColor, length, lowerHeight, 0.21,
          x + nx * 0.02, lowerHeight / 2, z + nz * 0.02, rotation, false, 'lane-plaster')
      }
      const baseHeight = roadview?.stoneBaseHeight ?? (roadview ? 0.5 : 0.29)
      this.box(roadview?.baseColor ?? this.shade(building.wallColor, 0.78),
        length, baseHeight, 0.22, x, baseHeight / 2, z, rotation,
        false, roadview?.stoneBaseHeight ? 'concrete' : undefined)
      this.box(this.shade(building.wallColor, 0.86), length, 0.12, 0.24, x, 2.85, z, rotation)
      if (observed.surface === 'panel') for (let y = 0.48; y < height; y += 0.31) {
        const color = y < (roadview?.lowerWallHeight ?? 0) ? lowerWallColor! : building.wallColor
        this.box(this.shade(color, roadview?.tileGrid ? 0.83 : 1.05), length, 0.018, 0.025,
          x + nx * 0.14, y, z + nz * 0.14, rotation)
      }
      if (observed.surface === 'wood') for (let y = 0.3; y < height; y += 0.16)
        this.box(this.shade(building.wallColor, 0.74), length, 0.012, 0.025,
          x + nx * 0.14, y, z + nz * 0.14, rotation)
      if (roadview?.tileGrid) for (let offset = -length / 2 + 0.46; offset < length / 2; offset += 0.46) {
        this.box(this.shade(building.wallColor, 0.83), 0.014, height, 0.025,
          x + dx * offset + nx * 0.14, height / 2, z + dz * offset + nz * 0.14, rotation)
      }
      for (const band of roadview?.bands ?? []) this.box(band.color, length, band.thickness, 0.025,
        x + nx * 0.16, band.height, z + nz * 0.16, rotation)
      if (sharedEdges.has(index)) continue
      if (isFront && length > 2.5) {
        const frontX = x + nx * 0.14
        const frontZ = z + nz * 0.14
        if (roadview?.drainpipe) {
          const px = frontX + dx * (length / 2 - 0.12) + nx * 0.08
          const pz = frontZ + dz * (length / 2 - 0.12) + nz * 0.08
          this.beam(0xc3c8c7, [px, 0.18, pz], [px, height - 0.12, pz], 0.065)
          for (let y = 0.65; y < height; y += 1.3)
            this.box(0x949f9d, 0.12, 0.035, 0.085, px, y, pz, rotation)
          this.beam(0xc3c8c7, [px, 0.18, pz], [px + nx * 0.16, 0.09, pz + nz * 0.16], 0.065)
        }
        if (roadview?.sign) {
          const signOffset = length * (roadview.sign.offsetFraction ?? 0)
          const signWidth = Math.min(length - 0.22, length * (roadview.sign.widthFraction ?? 1))
          const signY = roadview.sign.centerY ?? 3.08
          const signX = frontX + dx * signOffset, signZ = frontZ + dz * signOffset
          this.box(roadview.sign.color, signWidth, roadview.sign.panelHeight ?? 0.68, 0.08,
            signX + nx * 0.12, signY, signZ + nz * 0.12, rotation)
          this.sign(roadview.sign.text, signX + nx * 0.18, signY, signZ + nz * 0.18,
            rotation, nx, nz, signWidth - 0.26, `#${roadview.sign.ink.toString(16).padStart(6, '0')}`)
        }
        if (roadview?.cloudMural) {
          for (const [offset, y] of [[-0.28, 2.1], [-0.28, 5.85], [0.28, 3.55]])
            this.paintedCloud(frontX + dx * length * offset, y,
              frontZ + dz * length * offset, rotation, nx, nz)
        }
        if (roadview?.openings) {
          for (const opening of roadview.openings) this.drawOpening(opening, building, frontX, frontZ,
            { dx, dz, nx, nz, rotation, length, height })
        } else if (observed.ground === 'house') {
          this.houseDoor(frontX - dx * length * 0.25, frontZ - dz * length * 0.25,
            rotation, nx, nz, building.roadview?.doorColor ?? this.shade(building.wallColor, 0.65))
          this.framedWindow(frontX + dx * length * 0.2, 1.45,
            frontZ + dz * length * 0.2, rotation, nx, nz,
            Math.min(roadview?.groundWindowWidth ?? 1.45, length * 0.48), 1.5, false)
          if (roadview?.windowBars) {
            const width = Math.min(roadview.groundWindowWidth ?? 1.45, length * 0.48)
            for (let offset = -width / 2 + 0.15; offset < width / 2; offset += 0.22) {
              this.box(0xcdd4cb, 0.026, 1.45, 0.026,
                frontX + dx * (length * 0.2 + offset) + nx * 0.18, 1.45,
                frontZ + dz * (length * 0.2 + offset) + nz * 0.18, rotation)
            }
          }
        } else if (observed.ground === 'window') {
          const count = Math.min(roadview?.groundWindowColumns ?? 1,
            Math.max(1, Math.floor(length / (roadview?.groundWindowColumns ? 1.4 : 2.3))))
          const width = Math.min(roadview?.groundWindowWidth ?? 2.25, length / count - 0.4)
          for (let pane = 0; pane < count; pane++) {
            const offset = count === 1 ? -length * 0.2 : (pane - (count - 1) / 2) * (length - 0.8) / count
            const wx = frontX + dx * offset + nx * 0.02, wz = frontZ + dz * offset + nz * 0.02
            this.framedWindow(wx, 1.85, wz, rotation, nx, nz, width, 1.65, true)
            if (roadview?.windowBars) for (let bar = -width / 2 + 0.15; bar < width / 2; bar += 0.22)
              this.box(0xcdd4cb, 0.026, 1.6, 0.026,
                wx + dx * bar + nx * 0.18, 1.85, wz + dz * bar + nz * 0.18, rotation)
          }
        } else if (observed.ground === 'shutter-glass') {
          const shutterWidth = Math.max(1.1, length * 0.54)
          const shutterX = frontX + dx * length * 0.17
          const shutterZ = frontZ + dz * length * 0.17
          this.box(0xb5c3c0, shutterWidth, 2.15, 0.09, shutterX, 1.5, shutterZ, rotation)
          for (let y = 0.5; y < 2.54; y += 0.11) this.box(0x829593, shutterWidth, 0.018, 0.12,
            shutterX + nx * 0.03, y, shutterZ + nz * 0.03, rotation)
          this.framedWindow(frontX - dx * length * 0.29 + nx * 0.09, 1.48,
            frontZ - dz * length * 0.29 + nz * 0.09, rotation, nx, nz, Math.max(0.8, length * 0.3), 2.1, false)
          this.box(0xe1e2dc, length - 0.3, 0.24, 0.24, frontX, 2.77, frontZ, rotation)
        } else if (observed.ground === 'shutter') {
          this.box(0x687a79, length - 0.48, 2.2, 0.08, frontX, 1.52, frontZ, rotation)
          this.box(0xb3bab2, length - 0.67, 1.94, 0.09,
            frontX + nx * 0.06, 1.5, frontZ + nz * 0.06, rotation)
          for (let y = 0.67; y < 2.47; y += 0.14) this.box(0x899792, length - 0.7, 0.018, 0.1,
            frontX + nx * 0.12, y, frontZ + nz * 0.12, rotation)
        } else {
          this.box(0x435659, length - 0.44, 2.28, 0.08, frontX, 1.48, frontZ, rotation)
          const paneCount = length > 6 ? 3 : 2
          for (let pane = 0; pane < paneCount; pane++) {
            const offset = (pane - (paneCount - 1) / 2) * (length - 0.76) / paneCount
            this.framedWindow(frontX + dx * offset + nx * 0.12, 1.46,
              frontZ + dz * offset + nz * 0.12, rotation, nx, nz,
              (length - 0.9) / paneCount, 2.02, false)
          }
        }
        if (observed.awning) {
          if (roadview?.awningProfile === 'curved') {
            const awningWidth = Math.min(length - 0.3, 4.1)
            const point = (along: number, angle: number): [number, number, number] => [
              frontX + dx * along + nx * 0.85 * Math.cos(angle),
              2.72 + 0.72 * Math.sin(angle),
              frontZ + dz * along + nz * 0.85 * Math.cos(angle),
            ]
            for (let step = 0; step < 10; step++) {
              const a = step / 10 * Math.PI / 2, b = (step + 1) / 10 * Math.PI / 2
              this.quad(observed.awning, [point(-awningWidth / 2, a), point(awningWidth / 2, a),
                point(awningWidth / 2, b), point(-awningWidth / 2, b)], undefined, true)
              for (const along of [-awningWidth / 2, 0, awningWidth / 2])
                this.beam(0xe6eee7, point(along, a), point(along, b), 0.04)
            }
            this.beam(0xe6eee7, point(-awningWidth / 2, 0), point(awningWidth / 2, 0), 0.045)
          } else {
          this.box(observed.awning, length - 0.25, 0.12, 0.78,
            frontX + nx * 0.4, 2.98, frontZ + nz * 0.4, rotation)
          this.box(this.shade(observed.awning, 0.85), length - 0.25, 0.24, 0.06,
            frontX + nx * 0.78, 2.84, frontZ + nz * 0.78, rotation)
          }
        }
        if ((roadview?.balcony || building.observed?.balcony) && height > 6.2) {
          const railColor = 0x65706b
          for (const railHeight of [3.45, 3.86]) this.box(railColor, length - 0.55, 0.045, 0.055,
            frontX + nx * 0.28, railHeight, frontZ + nz * 0.28, rotation)
          for (let rail = -length / 2 + 0.38; rail < length / 2 - 0.2; rail += 0.64) {
            this.box(railColor, 0.035, 0.48, 0.05,
              frontX + dx * rail + nx * 0.28, 3.63,
              frontZ + dz * rail + nz * 0.28, rotation)
          }
        }
      }
      if (length < 2.2) continue
      if (isFront && roadview?.openings) continue
      for (let row = 0; row < observed.windowRows; row++) {
        const windowY = (roadview?.windowStartHeight ?? 4.25) + row * 2.65
        if (windowY + 0.67 >= height) continue
        const authoredColumns = roadview?.windowColumns ?? building.observed?.windowColumns
        const count = isFront
          ? Math.min(authoredColumns ?? 3, Math.max(1, Math.floor(length / (authoredColumns ? 1.4 : 2.3))))
          : Math.min(2, Math.max(1, Math.floor(length / 3)))
        for (let pane = 0; pane < count; pane++) {
          const offset = (pane - (count - 1) / 2) * Math.min(roadview?.windowSpacing ?? 2.7, (length - 0.6) / count)
          const windowX = x + dx * offset + nx * 0.14
          const windowZ = z + dz * offset + nz * 0.14
          const windowWidth = Math.min(roadview?.upperWindowWidth ?? 1.45, (length - 0.6) / count - 0.12)
          this.framedWindow(windowX, windowY, windowZ, rotation, nx, nz,
            windowWidth, 1.25, observed.surface === 'brick')
          if (isFront && roadview?.windowBars) {
            const spacing = roadview.barSpacing ?? windowWidth * 0.27
            for (let offset = -windowWidth * 0.38; offset <= windowWidth * 0.38; offset += spacing)
              this.box(roadview.barSpacing ? 0xcdd4cb : 0x747a74, 0.028, 1.23, 0.025,
                windowX + dx * offset + nx * 0.22, windowY,
                windowZ + dz * offset + nz * 0.22, rotation)
          }
        }
      }
    }
  }

  // 벽 바깥면(x, z)을 기준으로 창·문 하나를 그립니다. sign은 offsetFraction의 방향(+1이면 변 방향)입니다.
  private drawOpening(opening: FacadeOpening, building: StreetBuilding, x: number, z: number,
    wall: { dx: number; dz: number; nx: number; nz: number; rotation: number; length: number; height: number }) {
    const { dx, dz, nx, nz, rotation, length, height } = wall
    const offset = length * opening.offsetFraction
    const width = Math.min(opening.width, 2 * (length / 2 - Math.abs(offset) - 0.12))
    if (width < 0.3 || opening.centerY + opening.height / 2 >= height) return
    const wx = x + dx * offset, wz = z + dz * offset
    if (opening.kind === 'window') {
      this.framedWindow(wx, opening.centerY, wz, rotation, nx, nz, width, opening.height, false)
    } else {
      this.box(0xe0e6de, width + 0.12, opening.height + 0.12, 0.08,
        wx, opening.centerY, wz, rotation)
      this.box(building.roadview?.doorColor ?? this.shade(building.wallColor, 0.62), width, opening.height, 0.09,
        wx + nx * 0.05, opening.centerY, wz + nz * 0.05, rotation)
      this.box(0xe0e6de, 0.06, 0.16, 0.04,
        wx + dx * width * 0.32 + nx * 0.13, opening.centerY,
        wz + dz * width * 0.32 + nz * 0.13, rotation)
    }
    if (opening.bars) for (let bar = -width / 2 + 0.12; bar < width / 2; bar += 0.2)
      this.box(0xd6ddd4, 0.025, opening.height - 0.06, 0.025,
        wx + dx * bar + nx * 0.18, opening.centerY,
        wz + dz * bar + nz * 0.18, rotation)
  }

  private buildContextBuilding(building: StreetBuilding, outline: [number, number][]) {
    const height = building.heightMeters
    const sharedEdges = new Set(building.sharedEdges)
    const [centerX, centerZ] = outlineCenter(outline)
    const area = polygonArea(outline)
    const edges = outline.map(([ax, az], index) => {
      const [bx, bz] = outline[(index + 1) % outline.length]
      const length = Math.hypot(bx - ax, bz - az)
      const x = (ax + bx) / 2
      const z = (az + bz) / 2
      return { length, distance: distanceToRoad(x, z) }
    })
    const front = edges.reduce((best, edge, index) =>
      !sharedEdges.has(index) && edge.length >= 2.3 && (best < 0 || edge.distance - Math.min(edge.length, 8) * 0.08 <
        edges[best].distance - Math.min(edges[best].length, 8) * 0.08) ? index : best, -1)
    const trim = 0xe8e6dd
    const base = this.shade(building.wallColor, 0.83)
    const surface: ConceptSurface = area >= 145 && building.roofStyle === 'flat'
      ? 'context-stone' : area >= 48 && building.roofStyle === 'flat' ? 'context-tile' : 'context-stucco'
    // Roof silhouette matters across the widened scene: the aerial reference
    // contains many long blue metal roofs among flat concrete terraces.
    const metalRoof = building.roofFinish === 'sheet'
    this.detailedRoof(building.roofColor, building.wallColor, outline, height,
      building.id, building.roofStyle, building.roofStyle === 'gable', true,
      metalRoof ? 'roof-sheet' : 'roof-grain')
    // Give the roof a readable silhouette from the map's usual aerial view.
    // Equipment is a generic massing cue, confined to roof interiors; its exact
    // placement and existence are not claimed to be survey data.
    if (building.roofStyle === 'flat' && area > 42) {
      const roofPoint = roofInteriorPoint(outline)
      if (roofPoint && roofPoint.clearance > 1.55) {
        if (area > 105 && roofPoint.clearance > 2.05 && !metalRoof) {
          const longest = edges.reduce((best, edge, index) => edge.length > edges[best].length ? index : best, 0)
          const [ax, az] = outline[longest]
          const [bx, bz] = outline[(longest + 1) % outline.length]
          const rotation = -Math.atan2(bz - az, bx - ax)
          const accessColor = this.shade(building.wallColor, 0.94)
          this.box(accessColor, 2.35, 1.72, 2.05,
            roofPoint.x, height + 0.91, roofPoint.z, rotation, false, surface)
          this.box(trim, 2.57, 0.12, 2.27,
            roofPoint.x, height + 1.83, roofPoint.z, rotation)
          this.box(0x647b7e, 0.62, 1.24, 0.035,
            roofPoint.x + Math.cos(rotation) * 0.78, height + 0.79,
            roofPoint.z - Math.sin(rotation) * 0.78, rotation)
        } else {
          this.box(0xa9b4ad, 1.12, 0.56, 0.92,
            roofPoint.x, height + 0.32, roofPoint.z)
          this.box(0x657b7b, 1.2, 0.07, 1.0,
            roofPoint.x, height + 0.64, roofPoint.z)
        }
      }
    }
    for (let index = 0; index < outline.length; index++) {
      const [ax, az] = outline[index]
      const [bx, bz] = outline[(index + 1) % outline.length]
      const dx = bx - ax
      const dz = bz - az
      const length = Math.hypot(dx, dz)
      if (length < 0.2) continue
      const x = (ax + bx) / 2
      const z = (az + bz) / 2
      const rotation = -Math.atan2(dz, dx)
      const centerDistance = Math.hypot(x - centerX, z - centerZ) || 1
      const nx = (x - centerX) / centerDistance
      const nz = (z - centerZ) / centerDistance
      this.box(building.wallColor, length, height, 0.17, x, height / 2, z,
        rotation, false, surface)
      if (sharedEdges.has(index)) continue
      this.box(base, length, 0.56, 0.2, x + nx * 0.025, 0.28, z + nz * 0.025,
        rotation, false, 'context-stone')
      this.box(trim, length, 0.095, 0.24, x + nx * 0.03, 2.86, z + nz * 0.03, rotation)
      if (building.roofStyle === 'flat') {
        this.box(trim, length, area > 65 ? 0.46 : 0.32, 0.23,
          x, height + (area > 65 ? 0.25 : 0.18), z, rotation,
          false, 'context-stucco')
        this.box(this.shade(building.roofColor, 0.8), length, 0.06, 0.3,
          x, height + (area > 65 ? 0.52 : 0.37), z, rotation)
      } else {
        this.box(this.shade(building.roofColor, 0.72), length, 0.1, 0.28,
          x, height - 0.02, z, rotation)
      }
      const isFront = index === front && length >= 2.3
      if (length > 3) {
        const pipeX = ax + dx * 0.13 + nx * 0.13
        const pipeZ = az + dz * 0.13 + nz * 0.13
        this.box(0x9ca8a3, 0.065, height - 0.34, 0.07,
          pipeX, height / 2, pipeZ, rotation)
        this.box(0x778783, 0.16, 0.09, 0.13,
          pipeX, 0.62, pipeZ, rotation)
      }
      if (isFront) {
        const doorOffset = length > 5.2 ? -length * 0.29 : -length * 0.24
        const doorX = x + dx / length * doorOffset + nx * 0.13
        const doorZ = z + dz / length * doorOffset + nz * 0.13
        this.box(this.shade(building.wallColor, 0.7), 1.58, 2.44, 0.07,
          doorX, 1.44, doorZ, rotation)
        this.houseDoor(doorX + nx * 0.04, doorZ + nz * 0.04,
          rotation, nx, nz, surface === 'context-tile' ? 0x7c8984 : 0x938b7b)
        if (length >= 4.5) {
          const groundOffset = Math.min(length * 0.25, 2.3)
          const groundX = x + dx / length * groundOffset + nx * 0.14
          const groundZ = z + dz / length * groundOffset + nz * 0.14
          const groundWidth = Math.min(1.65, length * 0.33)
          this.box(this.shade(building.wallColor, 0.89), groundWidth + 0.28, 1.64, 0.05,
            groundX, 1.65, groundZ, rotation)
          this.framedWindow(groundX + nx * 0.04, 1.65, groundZ + nz * 0.04,
            rotation, nx, nz, groundWidth, 1.41, true)
        }
      }
      if (length < 3.3) continue
      const count = isFront
        ? Math.max(1, Math.min(3, Math.floor(length / 2.55)))
        : Math.max(1, Math.min(2, Math.floor(length / 3.8)))
      const spacing = Math.min(2.7, (length - 0.9) / count)
      if (!isFront) {
        const groundCount = Math.max(1, Math.min(2, Math.floor(length / 4.5)))
        const groundSpacing = Math.min(3.2, (length - 0.95) / groundCount)
        for (let pane = 0; pane < groundCount; pane++) {
          const offset = (pane - (groundCount - 1) / 2) * groundSpacing
          const wx = x + dx / length * offset + nx * 0.13
          const wz = z + dz / length * offset + nz * 0.13
          const windowWidth = Math.min(1.12, groundSpacing - 0.35)
          this.framedWindow(wx, 1.78, wz, rotation, nx, nz,
            windowWidth, 1.26, true)
        }
      }
      for (let y = 4.45; y + 0.65 < height - 0.3; y += 2.65) {
        for (let pane = 0; pane < count; pane++) {
          const offset = (pane - (count - 1) / 2) * spacing
          const wx = x + dx / length * offset + nx * 0.11
          const wz = z + dz / length * offset + nz * 0.11
          const windowWidth = Math.min(isFront ? 1.42 : 1.05, spacing - 0.28)
          this.box(this.shade(building.wallColor, 0.86), windowWidth + 0.23, 1.46,
            0.06, wx, y, wz, rotation)
          this.framedWindow(wx + nx * 0.04, y, wz + nz * 0.04,
            rotation, nx, nz, windowWidth, 1.24, true)
        }
      }
    }
  }

  private buildDistrictBuilding(building: StreetBuilding, outline: [number, number][]) {
    const h = building.heightMeters
    const [cx, cz] = outlineCenter(outline)
    const shared = new Set(building.sharedEdges)
    // 먼 동네는 휴대폰에서 삼각형 수가 프레임을 가장 많이 잡아먹으므로, 벽·띠를 바깥 면 하나씩으로 줄이고
    // 지붕 테두리 막대도 뺍니다(변 하나에 삼각형 약 42개 → 6개).
    this.detailedRoof(building.roofColor, building.wallColor, outline, h, building.id,
      building.roofStyle, true, true, 'roof-grain', false, false)
    const window = (x: number, y: number, z: number, ux: number, uz: number, nx: number, nz: number, width: number) => {
      const half = width / 2
      this.quad(0xffffff, [
        [x - ux * half + nx * 0.12, y - 0.65, z - uz * half + nz * 0.12],
        [x + ux * half + nx * 0.12, y - 0.65, z + uz * half + nz * 0.12],
        [x + ux * half + nx * 0.12, y + 0.65, z + uz * half + nz * 0.12],
        [x - ux * half + nx * 0.12, y + 0.65, z - uz * half + nz * 0.12],
      ], 'district-window')
    }
    for (let index = 0; index < outline.length; index++) {
      const [ax, az] = outline[index], [bx, bz] = outline[(index + 1) % outline.length]
      const length = Math.hypot(bx - ax, bz - az)
      if (length < 0.15) continue
      const ux = (bx - ax) / length, uz = (bz - az) / length
      const x = (ax + bx) / 2, z = (az + bz) / 2
      const outward = (-uz) * (x - cx) + ux * (z - cz) >= 0 ? 1 : -1
      const nx = -uz * outward, nz = ux * outward
      const plain = !building.inferred?.surface || building.inferred.surface === 'plaster'
      const wallSurface: ConceptSurface = building.inferred?.surface === 'brick' ? 'lane-brick'
        : building.inferred?.surface === 'wood' ? 'wood'
          : building.inferred?.surface === 'panel' ? 'context-tile'
            // 먼 동네의 미장 벽은 창문·층 띠를 그린 텍스처 한 장으로 그려 도형 수를 크게 줄입니다.
            : shared.has(index) ? 'context-stucco' : 'district-facade'
      const a = outline[index], b = outline[(index + 1) % outline.length]
      if (shared.has(index)) {
        this.wallFace(building.wallColor, a, b, nx, nz, 0.075, 0, h, wallSurface)
        continue
      }
      this.wallFace(0xb6bfba, a, b, nx, nz, 0.095, 0, 0.38, 'context-stone')
      this.wallFace(building.wallColor, a, b, nx, nz, 0.075, 0.38, h, wallSurface)
      this.wallFace(0xe8e6dd, a, b, nx, nz, 0.11, h - 0.02, h + 0.405)
      if (plain) continue
      // 벽돌·목재·패널 벽은 재질 텍스처 위에 창만 얇은 면으로 붙입니다(창턱·층 띠는 생략).
      const count = Math.min(7, Math.floor(length / 2.5))
      for (let row = 1.65; row + 0.8 < h; row += 2.65) for (let col = 0; col < count; col++) {
        const along = (col - (count - 1) / 2) * Math.min(3.1, length / (count + 0.3))
        window(x + ux * along, row, z + uz * along, ux, uz, nx, nz, 1.35)
      }
    }
  }

  private build() {
    const buildings = getPhotographedStreetBuildings().filter((building) =>
      !GREEN_HOUSE_FOOTPRINT_IDS.has(building.id) && building.id !== BEAUTIFUL_HANGUL_FOOTPRINT_ID)
    const workshop = buildings.find((building) => building.id === ARTIST_WORKSHOP_FOOTPRINT_ID)
    if (workshop) this.workshopCenter = outlineCenter(workshop.outline.map(streetMeters))
    this.buildGroundAndSideRoads(buildings)
    for (const building of buildings) {
      const outline = building.outline.map(streetMeters)
      this.group = building.id === ARTIST_WORKSHOP_FOOTPRINT_ID ? 'scene' : this.ringOf(outline)
      this.buildingContext = { outline, height: building.heightMeters }
      this.buildingBase = this.terrainBuildingBase(outline)
      this.currentBuilding = -1
      this.addTerrainFoundation(outline)
      if (building.concept) {
        this.doubleSided = true
        this.buildConceptBuilding(building, outline)
        this.doubleSided = false
        continue
      }
      if (building.id === ARTIST_WORKSHOP_FOOTPRINT_ID) {
        this.doubleSided = true
        buildArtistWorkshopModel({
          box: this.box.bind(this), beam: this.beam.bind(this), roof: this.roof.bind(this),
          geometry: this.addFinishedGeometry.bind(this),
        }, outline)
        this.doubleSided = false
        continue
      }
      if (building.observed || building.roadview || (building.inferred && building.detail === 'featured')) {
        this.buildObservedBuilding(building, outline)
        continue
      }
      const center: [number, number] = [
        building.outline.reduce((sum, [x]) => sum + x, 0) / building.outline.length,
        building.outline.reduce((sum, [, z]) => sum + z, 0) / building.outline.length,
      ]
      const streetDistance = nearestStreet(center).distanceMeters
      if (streetDistance > 75) {
        // 거리에서 먼 건물은 첫 화면을 먼저 띄운 뒤 나눠서 만듭니다(scheduleDistrictBuild).
        this.pendingDistrict.push({ building, outline, distance: streetDistance })
        continue
      }
      if (building.detail === 'context' || building.id !== 1469906540) {
        this.buildContextBuilding(building, outline)
        continue
      }
      const { heightMeters: height, wallColor, roofColor, accentColor } = building
      this.detailedRoof(roofColor, wallColor, outline, height, building.id, building.roofStyle)
      const centerX = outline.reduce((sum, point) => sum + point[0], 0) / outline.length
      const centerZ = outline.reduce((sum, point) => sum + point[1], 0) / outline.length

      let facadeIndex = -1
      let facadeDistance = Infinity
      for (let index = 0; index < outline.length; index++) {
        const a = outline[index]
        const b = outline[(index + 1) % outline.length]
        const length = Math.hypot(b[0] - a[0], b[1] - a[1])
        const midpoint: [number, number] = [
          (building.outline[index][0] + building.outline[(index + 1) % outline.length][0]) / 2,
          (building.outline[index][1] + building.outline[(index + 1) % outline.length][1]) / 2,
        ]
        const distance = nearestStreet(midpoint).distanceMeters
        if (length >= 2.1 && distance < facadeDistance) {
          facadeDistance = distance
          facadeIndex = index
        }
      }

      for (let index = 0; index < outline.length; index++) {
        const [ax, az] = outline[index]
        const [bx, bz] = outline[(index + 1) % outline.length]
        const dx = bx - ax
        const dz = bz - az
        const length = Math.hypot(dx, dz)
        if (length < 0.18) continue
        const x = (ax + bx) / 2
        const z = (az + bz) / 2
        const rotation = -Math.atan2(dz, dx)
        const outwardX = x - centerX
        const outwardZ = z - centerZ
        const outwardLength = Math.hypot(outwardX, outwardZ) || 1
        const outerNx = outwardX / outwardLength
        const outerNz = outwardZ / outwardLength
        this.box(wallColor, length, height, 0.16, x, height / 2, z, rotation, false,
          building.brickFacade ? 'lane-brick' : 'lane-plaster')
        this.box(this.shade(wallColor, 0.7), length, 0.43, 0.19, x, 0.25, z, rotation)
        this.box(this.shade(wallColor, 0.8), length, 0.16, 0.2, x, height - 0.09, z, rotation)
        for (let band = 3.25; band < height - 0.5; band += 2.65) {
          this.box(this.shade(wallColor, 0.83), length, 0.075, 0.2, x, band, z, rotation)
        }
        if (building.brickFacade && length > 1.5) {
          const grout = this.shade(wallColor, 0.72)
          for (let course = 0.63, row = 0; course < height - 0.24; course += 0.31, row++) {
            this.box(grout, length, 0.012, 0.19, x, course, z, rotation)
            if (index === facadeIndex) for (let offset = -length / 2 + 0.5 + row % 2 * 0.48; offset < length / 2 - 0.14; offset += 0.96) {
              this.box(grout, 0.018, 0.3, 0.19,
                x + dx / length * offset, course + 0.16,
                z + dz / length * offset, rotation)
            }
          }
        }
        if (index !== facadeIndex || facadeDistance > 12) {
          if (length > 3.2) {
            const sideX = x + outerNx * 0.12
            const sideZ = z + outerNz * 0.12
            const count = Math.min(3, Math.max(1, Math.floor(length / 2.7)))
            for (let story = 0; 4.15 + story * 2.65 < height - 0.75; story++) {
              for (let pane = 0; pane < count; pane++) {
                const offset = (pane - (count - 1) / 2) * Math.min(2.7, length / count)
                const wx = sideX + dx / length * offset
                const wz = sideZ + dz / length * offset
                this.framedWindow(wx, 4.15 + story * 2.65, wz, rotation, outerNx, outerNz, 0.82, 1.06, !building.brickFacade)
              }
            }
          }
          continue
        }

        const nearest = nearestStreet([
          (building.outline[index][0] + building.outline[(index + 1) % outline.length][0]) / 2,
          (building.outline[index][1] + building.outline[(index + 1) % outline.length][1]) / 2,
        ])
        const towardX = nearest.point[0] - x
        const towardZ = nearest.point[1] - z
        const normalLength = Math.hypot(towardX, towardZ) || 1
        const nx = towardX / normalLength
        const nz = towardZ / normalLength
        const faceX = x + nx * 0.12
        const faceZ = z + nz * 0.12
        const glassWidth = Math.min(length - 0.55, 5.5)
        if (building.storefront && glassWidth > 1.5) {
          const frameColor = building.brickFacade ? 0x353e3e : 0xe5e7de
          this.box(frameColor, glassWidth + 0.18, 2.33, 0.07, faceX, 1.57, faceZ, rotation)
          if (building.shopfrontStyle === 'shutter') {
            this.box(0x71838a, glassWidth - 0.1, 2.12, 0.08, faceX + nx * 0.07, 1.51, faceZ + nz * 0.07, rotation)
            for (let rail = 0.58; rail < 2.57; rail += 0.23) {
              this.box(0x9caaad, glassWidth - 0.1, 0.025, 0.105, faceX + nx * 0.08, rail, faceZ + nz * 0.08, rotation)
            }
            for (const edge of [-1, 1]) this.box(0x506166, 0.12, 2.2, 0.14,
              faceX + dx / length * glassWidth * 0.5 * edge, 1.51,
              faceZ + dz / length * glassWidth * 0.5 * edge, rotation)
          } else {
            this.box(0x405e66, glassWidth - 0.12, 2.12, 0.055, faceX + nx * 0.06, 1.55, faceZ + nz * 0.06, rotation, true)
            this.box(0x9bb8b9, glassWidth * 0.65, 0.35, 0.015, faceX + nx * 0.095, 1.98, faceZ + nz * 0.095, rotation, true)
            for (const fraction of [-0.22, 0, 0.22]) {
              this.box(frameColor, 0.065, 2.18, 0.12,
                faceX + dx / length * glassWidth * fraction + nx * 0.08, 1.55,
                faceZ + dz / length * glassWidth * fraction + nz * 0.08, rotation)
            }
            this.box(frameColor, glassWidth, 0.06, 0.12, faceX + nx * 0.08, 1.17, faceZ + nz * 0.08, rotation)
          }
          const doorOffset = glassWidth > 3.7 ? glassWidth * 0.34 : 0
          this.shopDoor(faceX + dx / length * doorOffset + nx * 0.12,
            faceZ + dz / length * doorOffset + nz * 0.12, rotation, nx, nz,
            building.shopfrontStyle === 'shutter')
          const signWidth = Math.min(length - 0.24, 6.2)
          this.box(this.shade(accentColor, 0.58), signWidth + 0.12, 0.54, 0.12, faceX, 2.99, faceZ, rotation)
          this.box(accentColor, signWidth, 0.39, 0.14, faceX + nx * 0.075, 3, faceZ + nz * 0.075, rotation)
          this.box(accentColor, signWidth, 0.09, 0.9, x + nx * 0.5, 2.69, z + nz * 0.5, rotation)
          for (let stripe = -signWidth / 2 + 0.32; stripe < signWidth / 2; stripe += 0.64) {
            this.box(0xe9e3d0, 0.27, 0.018, 0.84,
              x + dx / length * stripe + nx * 0.5, 2.745,
              z + dz / length * stripe + nz * 0.5, rotation)
          }
        } else if (glassWidth > 1.3) {
          this.framedWindow(faceX, 1.9, faceZ, rotation, nx, nz, Math.min(glassWidth, 2.5), 1.14, true)
          if (length > 3.5) {
            const doorX = faceX + dx / length * Math.min(1.65, length * 0.3)
            const doorZ = faceZ + dz / length * Math.min(1.65, length * 0.3)
            this.shopDoor(doorX, doorZ, rotation, nx, nz, false)
          }
        }
        const upperStories = Math.floor((height - 0.7) / 2.65) - 1
        const count = Math.max(1, Math.min(4, Math.floor(length / 2.2)))
        for (let story = 0; story < upperStories; story++) {
          const y = 4.15 + story * 2.65
          for (let pane = 0; pane < count; pane++) {
            const offset = (pane - (count - 1) / 2) * Math.min(2.2, (length - 0.8) / count)
            const wx = faceX + dx / length * offset
            const wz = faceZ + dz / length * offset
            this.framedWindow(wx, y, wz, rotation, nx, nz, 0.98, 1.25, !building.brickFacade)
          }
          if (building.id % 4 === 0 && length > 4.2) {
            const balconyY = y - 0.81
            this.box(0xd8d6cb, Math.min(length - 0.6, 4.3), 0.12, 0.74, faceX + nx * 0.38, balconyY, faceZ + nz * 0.38, rotation)
            const railWidth = Math.min(length - 0.7, 4.2)
            for (let rail = -railWidth / 2; rail <= railWidth / 2 + 0.01; rail += 0.7) {
              this.box(0x667675, 0.045, 0.75, 0.045,
                faceX + dx / length * rail + nx * 0.76, balconyY + 0.39,
                faceZ + dz / length * rail + nz * 0.76, rotation)
            }
            this.box(0x667675, railWidth, 0.05, 0.05, faceX + nx * 0.76, balconyY + 0.78, faceZ + nz * 0.76, rotation)
          }
        }
      }
    }

    this.group = 'scene'
    this.buildingContext = null
    // The filmed road is part of the same union as all other carriageways.
    // Only its pavement edges are drawn separately, outside intersections.
    const points = PHOTOGRAPHED_STREET.map(streetMeters)
    const laneLift = 0.03
    this.roadArea(ROAD_GROUND.kerbStone, 0.083 + laneLift, 0xffffff, 'ground-stone')
    this.roadArea(ROAD_GROUND.kerbLine, 0.105 + laneLift, 0xe5e9df)
    // 원형 포장 무늬(위치·크기는 streetSceneData의 MEETING_CIRCLE_* 참고)
    const [roundX, roundZ] = streetMeters(MEETING_CIRCLE_CENTER)
    this.roadArea(ROAD_GROUND.meeting, 0.088 + laneLift, 0xffffff, 'ground-stone')
    for (const radius of [2.3, 2.66]) {
      const border = new THREE.TorusGeometry(radius, 0.03, 4, 48)
      border.rotateX(-Math.PI / 2)
      border.translate(roundX, 0.105 + laneLift, roundZ)
      this.addGeometry(0x87928e, border)
    }
    for (const [radius, tube, color] of [[1.38, 0.05, 0xd3d4c8], [1.03, 0.04, 0x657d7d], [0.69, 0.035, 0xd3d4c8]] as const) {
      const ring = new THREE.TorusGeometry(radius, tube, 5, 48)
      ring.rotateX(-Math.PI / 2)
      ring.translate(roundX, 0.115 + laneLift, roundZ)
      this.addGeometry(color, ring)
    }
    const poles = [points[2], points[4], points[6]].map(([x, z]) => [x + 3.35, z] as [number, number])
    for (const [x, z] of poles) {
      this.box(0x697775, 0.15, 8.7, 0.15, x, 4.35, z)
      this.box(0x697775, 1.45, 0.08, 0.08, x - 0.65, 8.4, z)
    }
    for (let index = 0; index < poles.length - 1; index++) {
      const [ax, az] = poles[index]
      const [bx, bz] = poles[index + 1]
      this.beam(0x4c5557, [ax - 1.25, 8.4, az], [bx - 1.25, 8.4, bz], 0.026)
      this.beam(0x6b7775, [ax - 0.5, 8.35, az], [bx - 0.5, 8.35, bz], 0.018)
    }
    this.landscape(buildings)
    this.flushSlots()
    // 가까운 동네부터 채워지도록 거리에서 가까운 순서로 만듭니다.
    this.pendingDistrict.sort((a, b) => a.distance - b.distance)
  }

  // 모아 둔 도형을 재질별로 하나의 메시로 합쳐 장면에 넣습니다.
  private flushSlots() {
    for (const slot of this.slots.values()) {
      if (slot.geometries.length === 0) continue
      const merged = mergeGeometries(slot.geometries)
      if (!merged) continue
      const ring = this.buildingRings.indexOf(slot.parent as THREE.Group)
      if (ring >= 0) {
        // 꺼지는 애니메이션에서 내릴 깊이(고리에서 가장 높은 지점 + 1m)를 미리 재 둡니다.
        merged.computeBoundingBox()
        this.ringDepth[ring] = Math.max(this.ringDepth[ring], (merged.boundingBox?.max.y ?? 0) + 1)
      }
      if (slot.plain) {
        // 같은 꼭짓점을 두 메시가 나눠 그립니다(비치지 않는 건물 / 비치는 건물).
        const index = new THREE.BufferAttribute(new Uint32Array(merged.getAttribute('position').count), 1)
        const fadeGeometry = new THREE.BufferGeometry()
        for (const [name, attribute] of Object.entries(merged.attributes)) fadeGeometry.setAttribute(name, attribute)
        merged.setIndex(index)
        fadeGeometry.setIndex(index)
        const runs = buildingRuns(merged.getAttribute('buildingIndex'))
        const split: FadeSplit = {
          runs, index, state: new Uint8Array(runs.length / 3),
          plain: this.addSlotMesh(merged, slot.plain, slot, ring),
          fade: this.addSlotMesh(fadeGeometry, slot.material, slot, ring),
        }
        this.partition(split, true)
        this.fadeSplits.push(split)
        slot.flushed.push({ geometry: merged, meshes: [split.plain, split.fade], split })
      } else {
        slot.flushed.push({ geometry: merged, meshes: [this.addSlotMesh(merged, slot.material, slot, ring)] })
      }
      slot.geometries.forEach((geometry) => geometry.dispose())
      slot.geometries = []
    }
  }

  // 나눠 만들면서 생긴 같은 재질의 메시 여러 개를 하나로 합칩니다. 메시마다 그리기 호출과 재질 전환이 따로 들어
  // 휴대폰에서는 CPU 시간이 프레임을 가장 많이 잡아먹습니다. 화면이 멈추지 않게 재질 하나씩 나눠 합칩니다.
  private consolidateSlots() {
    const pending = [...this.slots.values()].filter((slot) => slot.flushed.length > 1)
    const step = () => {
      const slot = pending.shift()
      if (!slot || !this.map) return
      const old = slot.flushed
      slot.flushed = []
      for (const { geometry, meshes, split } of old) {
        // 인덱스 없이 꼭짓점 속성만 다시 합칩니다(나눠 그리기 인덱스는 합친 뒤 새로 만듭니다).
        const source = new THREE.BufferGeometry()
        for (const [name, attribute] of Object.entries(geometry.attributes)) source.setAttribute(name, attribute)
        slot.geometries.push(source)
        for (const mesh of meshes) {
          mesh.removeFromParent()
          this.meshes.splice(this.meshes.indexOf(mesh), 1)
          const caster = this.ringShadowCasters.indexOf(mesh)
          if (caster >= 0) this.ringShadowCasters.splice(caster, 1)
        }
        if (split) this.fadeSplits.splice(this.fadeSplits.indexOf(split), 1)
      }
      this.flushSlots()
      for (const { meshes } of old) for (const mesh of meshes) mesh.geometry.dispose()
      this.shadowsBaked = false
      this.map.triggerRepaint()
      if (pending.length) setTimeout(step, 0)
    }
    setTimeout(step, 0)
  }

  private addSlotMesh(geometry: THREE.BufferGeometry, material: SlotMaterial, slot: MaterialSlot, ring: number) {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    mesh.castShadow = !slot.ground
    mesh.receiveShadow = !material.transparent
    // 비치는 유리·바닥 띠는 불투명한 장면을 다 그린 뒤에 그립니다. 불투명한 메시는 같은 재질끼리 이어 그리도록
    // 재질별 순서(0~1 사이, 사진 외관·간판(3~4)보다 먼저)를 줍니다. 같은 재질 안에서는 가까운 것부터 그립니다.
    if (material.transparent) mesh.renderOrder = 6
    else if (slot.groundLayer !== undefined) {
      material.depthWrite = false
      mesh.renderOrder = slot.groundLayer
    } else {
      if (!this.materialOrder.has(material)) this.materialOrder.set(material, (this.materialOrder.size + 1) / 1000)
      mesh.renderOrder = this.materialOrder.get(material)!
    }
    this.meshes.push(mesh)
    slot.parent.add(mesh)
    if (ring >= 0) {
      if (mesh.castShadow) this.ringShadowCasters.push(mesh)
      if (this.buildingOpacity < 1) this.applyBuildingOpacity(mesh)
    }
    return mesh
  }

  // 먼 동네 건물을 한 번에 약 12ms씩 나눠 만들어 화면이 멈추지 않게 합니다. 300동마다 메시로 합쳐 보여 주고,
  // 그림자 지도도 다시 계산합니다.
  private scheduleDistrictBuild() {
    const started = performance.now()
    let sinceFlush = 0
    const step = () => {
      if (!this.map) return
      const deadline = performance.now() + 12
      while (this.pendingDistrict.length && performance.now() < deadline) {
        const next = this.pendingDistrict.shift()!
        this.group = this.ringOf(next.outline)
        this.buildingContext = { outline: next.outline, height: next.building.heightMeters }
        this.buildingBase = this.terrainBuildingBase(next.outline)
        this.currentBuilding = -1
        this.addTerrainFoundation(next.outline)
        this.buildDistrictBuilding(next.building, next.outline)
        sinceFlush++
      }
      this.group = 'scene'
      if (sinceFlush >= 300 || !this.pendingDistrict.length) {
        // 새 메시는 이미 고리 묶음 안에 들어가므로, 숨긴 상태면 함께 숨겨진 채로 붙습니다.
        this.flushSlots()
        // 새로 붙은 먼 동네 건물도 길을 가리는지 다시 봅니다.
        this.scheduleOcclusion()
        sinceFlush = 0
        // 그림자 지도는 전체 장면을 한 번 더 그려야 해서 무겁습니다. 먼 동네를 다 붙인 뒤 한 번만 다시 계산합니다.
        if (!this.pendingDistrict.length) {
          this.shadowsBaked = false
          this.consolidateSlots()
        }
        this.map.triggerRepaint()
      }
      if (this.pendingDistrict.length) setTimeout(step, 0)
      else performance.measure(DISTRICT_BUILD_MEASURE, { start: started, end: performance.now() })
    }
    setTimeout(step, 0)
  }

  onAdd(map: Map, gl: WebGL2RenderingContext) {
    this.map = map
    // 그래픽 연결이 다시 붙어 층을 다시 추가한 경우에도 그림자 지도를 새로 계산합니다.
    this.shadowsBaked = false
    if (this.pendingDistrict.length) this.scheduleDistrictBuild()
    map.on('moveend', this.scheduleOcclusion)
    this.scheduleOcclusion()
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true })
    // 장면이 움직이지 않으므로 그림자 지도는 첫 프레임에 한 번만 계산합니다.
    configureRenderer(this.renderer)
    this.loadGreenHouse(map)
    this.loadBeautifulHangul(map)
  }

  render(_gl: WebGL2RenderingContext, options: { defaultProjectionData: { mainMatrix: ArrayLike<number> } }) {
    if (!this.renderer || !this.map) return
    const origin = MercatorCoordinate.fromLngLat(STREET_ORIGIN, 0)
    const scale = origin.meterInMercatorCoordinateUnits()
    const transform = new THREE.Matrix4()
      .makeTranslation(origin.x, origin.y, origin.z)
      .scale(new THREE.Vector3(scale, -scale, scale))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
    this.camera.projectionMatrix.fromArray(options.defaultProjectionData.mainMatrix)
    this.camera.projectionMatrix.multiply(transform)
    this.renderer.resetState()
    if (!this.shadowsBaked) {
      bakeShadowMap(this.renderer, this.scene, this.camera, _gl)
      this.shadowsBaked = true
    }
    // 그림자 패스가 끝난 뒤 뷰포트를 지도 캔버스 크기로 되돌리도록 매번 맞춥니다.
    this.renderer.setViewport(0, 0, _gl.drawingBufferWidth, _gl.drawingBufferHeight)
    // MapLibre 지형의 먼 거리 깊이값이 실제보다 높은 면으로 건물과 길을 가릴 수 있습니다.
    // 거리 장면 내부의 깊이 관계는 유지하면서, 바탕 지형의 깊이값만 지운 뒤 그립니다.
    if (this.terrain) this.renderer.clearDepth()
    this.renderer.render(this.scene, this.camera)
  }

  // 그린하우스 전용 모델을 불러와 장면에 바로 둡니다(공방처럼 '다른 건물 숨기기'와 상관없이 늘 보임).
  private greenHouse: THREE.Object3D | null = null
  private beautifulHangul: THREE.Object3D | null = null
  private loadGreenHouse(map: Map) {
    if (this.greenHouse) return
    new GLTFLoader().load(GREEN_HOUSE_URL, (gltf) => {
      if (this.map !== map) return
      const model = gltf.scene
      model.name = 'green-house'
      const placement = greenHouseOsmPlacement()
      model.scale.set(placement.scaleX, 1, placement.scaleZ)
      const outline = GREEN_HOUSE_PLAN.map(([px, pz]) => [px + placement.x, pz + placement.z] as [number, number])
      const base = this.terrainBuildingBase(outline)
      model.position.set(placement.x, base, placement.z)
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        object.castShadow = true
        object.receiveShadow = true
      })
      this.greenHouse = model
      this.scene.add(model)
      this.addModelFoundation(outline, base)
      this.shadowsBaked = false
      map.triggerRepaint()
    }, undefined, () => { /* 모델을 못 불러와도 나머지 장면은 그대로 둡니다. */ })
  }

  private loadBeautifulHangul(map: Map) {
    if (this.beautifulHangul) return
    new GLTFLoader().load(BEAUTIFUL_HANGUL_URL, (gltf) => {
      if (this.map !== map) return
      const model = gltf.scene
      model.name = 'beautiful-hangul'
      // OSM 윤곽 그대로 두면 넓힌 골목(감내1로175번안길 등)과 겹치므로, 차도·골목길에서 비켜 놓습니다.
      const [x, z] = streetMeters(BEAUTIFUL_HANGUL_CENTER)
      const [dx, dz] = shiftOffCarriageways(BEAUTIFUL_HANGUL_OUTLINE.map(streetMeters), 3, 'all')
      const outline = BEAUTIFUL_HANGUL_OUTLINE.map(streetMeters).map(([px, pz]) => [px + dx, pz + dz] as [number, number])
      const base = this.terrainBuildingBase(outline)
      model.position.set(x + dx, base, z + dz)
      // The GLB's vertices already follow the OSM quadrilateral at metre scale.
      // Rotate its west-facing entrance toward the alley and place its centre.
      model.rotation.y = BEAUTIFUL_HANGUL_ROTATION
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        object.castShadow = true
        object.receiveShadow = true
      })
      this.beautifulHangul = model
      this.scene.add(model)
      this.addModelFoundation(outline, base)
      this.shadowsBaked = false
      map.triggerRepaint()
    }, undefined, () => { /* Keep the rest of the map available if this model fails to load. */ })
  }

  onRemove() {
    this.modelFoundations.forEach((mesh) => {
      mesh.removeFromParent()
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    })
    this.modelFoundations = []
    if (this.beautifulHangul) {
      this.beautifulHangul.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        object.geometry.dispose()
        ;(Array.isArray(object.material) ? object.material : [object.material]).forEach((material: THREE.Material) => material.dispose())
      })
      this.beautifulHangul.removeFromParent()
      this.beautifulHangul = null
    }
    if (this.greenHouse) {
      this.greenHouse.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        object.geometry.dispose()
        ;(Array.isArray(object.material) ? object.material : [object.material]).forEach((material: THREE.Material) => material.dispose())
      })
      this.greenHouse.removeFromParent()
      this.greenHouse = null
    }
    cancelAnimationFrame(this.riseAnimation)
    this.riseAnimation = 0
    this.map?.off('moveend', this.scheduleOcclusion)
    if (this.occlusionTimer) clearTimeout(this.occlusionTimer)
    this.occlusionTimer = null
    this.meshes.forEach((mesh) => mesh.geometry.dispose())
    if (this.shadowCatcher) {
      this.shadowCatcher.geometry.dispose()
      ;(this.shadowCatcher.material as THREE.Material).dispose()
    }
    this.signMeshes.forEach((mesh) => { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose() })
    this.signTextures.forEach((texture) => texture.dispose())
    this.conceptTextures.forEach((texture) => texture.dispose())
    this.sharedMaterials.forEach((shared) => { shared.material.dispose(); shared.plain?.dispose() })
    this.fadeSplits = []
    this.renderer?.dispose()
    this.renderer = null
    this.map = null
  }
}

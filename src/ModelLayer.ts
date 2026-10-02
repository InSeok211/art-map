import { MercatorCoordinate } from 'maplibre-gl'
import type { CustomLayerInterface, Map } from 'maplibre-gl'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { ROAD_LAYER_IDS } from './mapStyle'
import type { MapModel, ModelAsset } from './modelCatalog'
import { boundingBox, convexHull, lineCrossesPolygon, shrinkPolygon } from './occlusion'
import type { Point } from './occlusion'
import { addSceneLights, aimSun, bakeShadowMap, configureRenderer, createShadowCatcher, fitShadowCatcher } from './threeShadows'

const ORIGIN: [number, number] = [129.0086, 35.0945]
export const SEE_THROUGH_OPACITY = 0.35
// 카메라가 움직이는 동안 가림 판정을 다시 계산하는 최소 간격(ms)입니다.
const OCCLUSION_INTERVAL = 150

// 반투명으로 그릴 인스턴스에만 재질을 복제해 적용합니다. 원본 재질은 다른 인스턴스와 공유됩니다.
function makeSeeThrough(instance: THREE.Object3D, opacity: number): THREE.Material[] {
  const cloned: THREE.Material[] = []
  instance.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const convert = (material: THREE.Material) => {
      const copy = material.clone()
      copy.opacity = material.opacity * opacity
      copy.transparent = true
      cloned.push(copy)
      return copy
    }
    object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material)
  })
  return cloned
}

type Geometry = { type: string; coordinates: unknown }

function lines(geometry: Geometry): [number, number][][] {
  if (geometry.type === 'LineString') return [geometry.coordinates as [number, number][]]
  if (geometry.type === 'MultiLineString' || geometry.type === 'Polygon') return geometry.coordinates as [number, number][][]
  if (geometry.type === 'MultiPolygon') return (geometry.coordinates as [number, number][][][]).flat()
  return []
}

export class ModelLayer implements CustomLayerInterface {
  readonly id = 'gamcheon-placed-models'
  readonly type = 'custom' as const
  readonly renderingMode = '3d' as const

  private map: Map | null = null
  private renderer: THREE.WebGLRenderer | null = null
  private camera = new THREE.Camera()
  private scene = new THREE.Scene()
  private objects = new THREE.Group()
  private loader = new GLTFLoader()
  private cache = new globalThis.Map<string, THREE.Group>()
  private localBoxes = new globalThis.Map<string, THREE.Box3>()
  private loading = new Set<string>()
  private assets: ModelAsset[] = []
  private items: MapModel[] = []
  private forcedOpacity = 1
  private autoSeeThrough = true
  private occluding = new Set<string>()
  private clonedMaterials: THREE.Material[] = []
  private checkedMatrix: number[] = []
  private occlusionTimer: ReturnType<typeof setTimeout> | null = null
  private removed = false
  private sun: THREE.DirectionalLight
  private shadowCatcher = createShadowCatcher()
  private shadowsDirty = true

  constructor(private onAssetError?: (name: string) => void) {
    // 거리 장면(StreetSceneLayer)과 같은 태양·하늘빛·톤을 써서 공방 모델이 주변 건물과 어울리게 합니다.
    this.sun = addSceneLights(this.scene, [0, 0], 40, 2048)
    this.scene.add(this.objects, this.shadowCatcher)
  }

  onAdd(map: Map, gl: WebGL2RenderingContext) {
    // 그래픽 연결이 끊겼다가 다시 붙을 때 같은 층을 다시 추가하므로, 지웠던 상태를 되돌리고 모델을 다시 불러옵니다.
    this.removed = false
    this.map = map
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true })
    configureRenderer(this.renderer)
    map.on('idle', this.handleIdle)
    this.sync()
  }

  // 카메라가 멈춘 뒤 늦게 불러온 도로 타일까지 반영해 한 번 더 판정합니다.
  private handleIdle = () => {
    if (this.autoSeeThrough && !this.occlusionTimer && this.objects.children.length > 0) this.updateOcclusion()
  }

  setAssets(assets: ModelAsset[]) {
    this.assets = assets
    this.sync()
  }

  setItems(items: MapModel[]) {
    this.items = items
    this.checkedMatrix = []
    this.sync()
  }

  // 1보다 작으면 가림 여부와 상관없이 모든 모델을 이 불투명도로 그립니다.
  setOpacity(opacity: number) {
    this.forcedOpacity = opacity
    this.sync()
  }

  // 켜져 있으면 현재 카메라에서 길을 가리는 모델만 반투명하게 그립니다.
  setAutoSeeThrough(enabled: boolean) {
    this.autoSeeThrough = enabled
    if (!enabled) this.occluding.clear()
    this.checkedMatrix = []
    this.sync()
  }

  private sync() {
    this.objects.clear()
    this.clonedMaterials.forEach((material) => material.dispose())
    this.clonedMaterials = []
    const base = MercatorCoordinate.fromLngLat(ORIGIN, 0)
    const unit = base.meterInMercatorCoordinateUnits()

    for (const item of this.items) {
      const asset = this.assets.find((candidate) => candidate.id === item.assetId)
      if (!asset) continue
      const model = this.cache.get(asset.id)
      if (!model) {
        this.load(asset)
        continue
      }
      const location = MercatorCoordinate.fromLngLat([item.longitude, item.latitude], item.altitudeMeters)
      const instance = model.clone(true)
      instance.position.set((location.x - base.x) / unit, item.altitudeMeters, (location.y - base.y) / unit)
      instance.scale.setScalar(item.widthMeters)
      instance.rotation.y = -item.rotation * Math.PI / 180
      instance.userData = { itemId: item.id, assetId: asset.id }
      const opacity = this.forcedOpacity < 1 ? this.forcedOpacity : this.occluding.has(item.id) ? SEE_THROUGH_OPACITY : 1
      if (opacity < 1) this.clonedMaterials.push(...makeSeeThrough(instance, opacity))
      instance.traverse((object) => { object.castShadow = true; object.receiveShadow = true })
      this.objects.add(instance)
    }
    this.fitShadows()
    this.map?.triggerRepaint()
  }

  // 배치된 모델을 감싸는 범위에만 그림자를 계산해, 모델이 몇 개뿐일 때도 선명하게 합니다.
  private fitShadows() {
    this.shadowsDirty = true
    if (this.objects.children.length === 0) return
    const box = new THREE.Box3().setFromObject(this.objects)
    const padding = Math.max(8, (box.max.y - box.min.y) * 2)
    const minX = box.min.x - padding, maxX = box.max.x + padding
    const minZ = box.min.z - padding, maxZ = box.max.z + padding
    aimSun(this.sun, [(minX + maxX) / 2, (minZ + maxZ) / 2], Math.max(maxX - minX, maxZ - minZ) / 2)
    fitShadowCatcher(this.shadowCatcher, minX, maxX, minZ, maxZ, 0.04)
  }

  private load(asset: ModelAsset) {
    if (this.loading.has(asset.id) || this.removed) return
    this.loading.add(asset.id)
    this.loader.loadAsync(asset.url).then((gltf) => {
      if (this.removed) return
      const box = new THREE.Box3().setFromObject(gltf.scene)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      const footprint = Math.max(size.x, size.z, 0.001)
      const normalized = new THREE.Group()
      const scaled = new THREE.Group()
      gltf.scene.position.sub(new THREE.Vector3(center.x, box.min.y, center.z))
      scaled.add(gltf.scene)
      scaled.scale.setScalar(1 / footprint)
      normalized.add(scaled)
      normalized.updateMatrixWorld(true)
      this.localBoxes.set(asset.id, new THREE.Box3().setFromObject(normalized))
      this.cache.set(asset.id, normalized)
      this.loading.delete(asset.id)
      this.checkedMatrix = []
      this.sync()
    }).catch(() => {
      this.loading.delete(asset.id)
      this.onAssetError?.(asset.name)
    })
  }

  // 모델 경계 상자를 화면에 투영한 영역을 지나는 길이 있으면 그 모델이 길을 가린다고 봅니다.
  private updateOcclusion() {
    this.occlusionTimer = null
    const map = this.map
    if (!map || this.removed || !this.autoSeeThrough) return
    this.checkedMatrix = this.camera.projectionMatrix.toArray()
    const canvas = map.getCanvas()
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    const layers = ROAD_LAYER_IDS.filter((id) => map.getLayer(id))
    const next = new Set<string>()
    const corner = new THREE.Vector3()

    for (const instance of this.objects.children) {
      const { itemId, assetId } = instance.userData as { itemId: string; assetId: string }
      // The photographed workshop is the destination landmark. Keep its
      // glazing and brick facade readable beside the street surface.
      if (assetId === 'artist-workshop') continue
      const local = this.localBoxes.get(assetId)
      if (!local) continue
      instance.updateMatrixWorld(true)
      const projected: Point[] = []
      for (const x of [local.min.x, local.max.x]) for (const y of [local.min.y, local.max.y]) for (const z of [local.min.z, local.max.z]) {
        corner.set(x, y, z).applyMatrix4(instance.matrixWorld)
        const clip = new THREE.Vector4(corner.x, corner.y, corner.z, 1).applyMatrix4(this.camera.projectionMatrix)
        if (clip.w <= 0) continue
        projected.push([(clip.x / clip.w + 1) / 2 * width, (1 - clip.y / clip.w) / 2 * height])
      }
      if (projected.length < 3) continue
      const silhouette = shrinkPolygon(convexHull(projected), 0.1)
      const [[minX, minY], [maxX, maxY]] = boundingBox(silhouette)
      if (maxX < 0 || maxY < 0 || minX > width || minY > height) continue
      const roads = map.queryRenderedFeatures([[minX, minY], [maxX, maxY]], { layers })
      const covers = roads.some((road) => lines(road.geometry as Geometry).some((line) =>
        lineCrossesPolygon(line.map((point) => {
          const { x, y } = map.project(point)
          return [x, y] as Point
        }), silhouette)))
      if (covers) next.add(itemId)
    }

    const changed = next.size !== this.occluding.size || [...next].some((id) => !this.occluding.has(id))
    this.occluding = next
    if (changed && this.forcedOpacity === 1) this.sync()
  }

  render(_gl: WebGL2RenderingContext, options: { defaultProjectionData: { mainMatrix: ArrayLike<number> } }) {
    if (!this.renderer || this.objects.children.length === 0) return
    const base = MercatorCoordinate.fromLngLat(ORIGIN, 0)
    const unit = base.meterInMercatorCoordinateUnits()
    const transform = new THREE.Matrix4()
      .makeTranslation(base.x, base.y, base.z)
      .scale(new THREE.Vector3(unit, -unit, unit))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
    this.camera.projectionMatrix.fromArray(options.defaultProjectionData.mainMatrix)
    this.camera.projectionMatrix.multiply(transform)
    this.renderer.resetState()
    if (this.shadowsDirty) {
      bakeShadowMap(this.renderer, this.scene, this.camera, _gl)
      this.shadowsDirty = false
    }
    this.renderer.setViewport(0, 0, _gl.drawingBufferWidth, _gl.drawingBufferHeight)
    this.renderer.render(this.scene, this.camera)

    // 카메라나 배치가 바뀐 뒤에만 가림 판정을 예약해, 멈춰 있을 때 반복해서 다시 그리지 않습니다.
    const matrix = this.camera.projectionMatrix.elements
    const moved = this.checkedMatrix.length === 0 || matrix.some((value, index) => Math.abs(value - this.checkedMatrix[index]) > 1e-9)
    if (this.autoSeeThrough && moved && !this.occlusionTimer) {
      this.occlusionTimer = setTimeout(() => this.updateOcclusion(), OCCLUSION_INTERVAL)
    }
  }

  onRemove() {
    this.removed = true
    if (this.occlusionTimer) clearTimeout(this.occlusionTimer)
    this.map?.off('idle', this.handleIdle)
    this.clonedMaterials.forEach((material) => material.dispose())
    this.shadowCatcher.geometry.dispose()
    ;(this.shadowCatcher.material as THREE.Material).dispose()
    this.renderer?.dispose()
    this.renderer = null
    this.map = null
    this.objects.clear()
    this.cache.clear()
  }
}

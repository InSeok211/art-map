import * as THREE from 'three'
import { resolveModelUrl } from '../buildings/buildingEdits'
import type { PlacedModel } from '../buildings/buildingEdits'
import { loadModel } from './modelFiles'
import { streetMeters } from '../map/streetCoordinates'

// 관리자가 올린 3D 모델(GLB)을 3D 거리에 둡니다(건물 탭 3단계). 모델의 바닥 가운데를 그 자리에 두고, 바닥의 긴
// 쪽이 widthMeters가 되게 늘이거나 줄여 rotation(도, 긴 쪽이 가리키는 방향)만큼 돌립니다. 언덕에서는 바닥의 가장
// 높은 땅에 올리고 아래를 기초 벽으로 채웁니다(그린하우스와 같은 방식).
// 모델 파일은 한 번만 읽어 원본(바닥 가운데·긴 쪽을 맞춘 것)을 두고, 배치마다 복제합니다. 위치·크기·방향만 바뀌면
// 3D 거리를 다시 만들지 않고 모델만 다시 놓습니다(set).

// 모델을 놓을 3D 거리 쪽 기능
export interface PlacedModelHost {
  readonly scene: THREE.Scene
  // 바닥 윤곽(장면 미터)을 올릴 높이
  baseHeight(outline: [number, number][]): number
  // 언덕에서 바닥 아래를 채우는 기초 벽(평지면 null). 장면에 붙여 돌려줍니다.
  addFoundation(outline: [number, number][], base: number): THREE.Mesh | null
  // 장면이 바뀌었을 때(그림자 다시 굽기·다시 그리기)
  changed(): void
}

// 원본: 바닥 가운데를 원점에, 긴 쪽을 x축에 맞춘 것과 바닥의 긴 쪽·짧은 쪽 길이(모델 단위)
interface Template { object: THREE.Object3D; long: number; short: number }

export class PlacedModels {
  private specs: readonly PlacedModel[]
  private templates = new globalThis.Map<string, Promise<Template | null>>()
  private objects: THREE.Object3D[] = []
  private foundations: THREE.Mesh[] = []
  private version = 0
  private attached = false

  constructor(private readonly host: PlacedModelHost, initial: readonly PlacedModel[], private readonly onError?: (name: string) => void) {
    this.specs = initial
  }

  set(models: readonly PlacedModel[]) {
    if (JSON.stringify(models) === JSON.stringify(this.specs)) return
    this.specs = models
    if (this.attached) this.sync()
  }

  // 3D 거리가 지도에 붙을 때 모델을 불러와 놓습니다.
  attach() {
    this.attached = true
    this.sync()
  }

  // 3D 거리가 지도에서 떨어질 때 모델과 불러온 원본을 정리합니다.
  detach() {
    this.attached = false
    this.version++
    this.clear()
    for (const template of this.templates.values()) template.then((loaded) => loaded && disposeObject(loaded.object))
    this.templates = new globalThis.Map()
  }

  private sync() {
    const version = ++this.version
    this.clear()
    const failed = new Set<string>()
    for (const placed of this.specs) this.template(placed.modelId).then((template) => {
      if (!this.attached || version !== this.version) return
      if (template) return this.add(placed, template)
      if (failed.has(placed.modelId)) return
      failed.add(placed.modelId)
      this.onError?.(placed.name || placed.modelId)
    })
    this.host.changed()
  }

  private template(modelId: string) {
    let template = this.templates.get(modelId)
    if (!template) {
      template = resolveModelUrl(modelId).then((url) => new Promise<Template | null>((resolve) => loadModel(url, (gltf) => {
        const model = gltf.scene
        const box = new THREE.Box3().setFromObject(model)
        if (box.isEmpty()) return resolve(null)
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())
        model.position.set(-center.x, -box.min.y, -center.z)
        model.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return
          object.castShadow = true
          object.receiveShadow = true
        })
        // 모델의 긴 쪽을 x축에 맞춥니다.
        const object = new THREE.Group()
        object.add(model)
        if (size.z > size.x) object.rotation.y = Math.PI / 2
        resolve({ object, long: Math.max(size.x, size.z, 0.001), short: Math.min(size.x, size.z) })
      }, () => resolve(null))))
      this.templates.set(modelId, template)
    }
    return template
  }

  private add(placed: PlacedModel, template: Template) {
    const scale = placed.widthMeters / template.long
    const angle = -placed.rotation * Math.PI / 180
    const [x, z] = streetMeters([placed.longitude, placed.latitude])
    const half = [placed.widthMeters / 2, template.short * scale / 2]
    const cos = Math.cos(angle), sin = Math.sin(angle)
    const outline = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sz]) => {
      const lx = sx * half[0], lz = sz * half[1]
      return [x + lx * cos + lz * sin, z - lx * sin + lz * cos] as [number, number]
    })
    const base = this.host.baseHeight(outline)
    // 원본과 도형·재질을 함께 씁니다(지울 때 원본만 정리).
    const holder = new THREE.Group()
    holder.name = `placed-model-${placed.id}`
    holder.add(template.object.clone(true))
    holder.scale.setScalar(scale)
    holder.rotation.y = angle
    holder.position.set(x, base, z)
    this.objects.push(holder)
    this.host.scene.add(holder)
    const foundation = this.host.addFoundation(outline, base)
    if (foundation) this.foundations.push(foundation)
    this.host.changed()
  }

  private clear() {
    this.objects.forEach((object) => object.removeFromParent())
    this.objects = []
    for (const mesh of this.foundations) {
      mesh.removeFromParent()
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    }
    this.foundations = []
  }
}

// 불러온 모델의 도형·재질·질감을 정리합니다.
export function disposeObject(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    ;(Array.isArray(object.material) ? object.material : [object.material]).forEach((material: THREE.Material) => {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose()
      material.dispose()
    })
  })
}

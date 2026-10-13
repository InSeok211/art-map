// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { ARTIST_WORKSHOP_FOOTPRINT_ID, getPhotographedStreetBuildings, streetMeters } from './streetSceneData'
import { StreetSceneLayer } from './StreetSceneLayer'

// 성능 예산: 첫 화면을 막는 3D 거리 장면 만들기 시간입니다. 개발 PC(Node)에서 약 3.5초이고, 도로 면을 미리
// 계산하기 전에는 17초가 넘었습니다. 느린 CI 기계를 고려해 넉넉히 잡되, 큰 퇴보는 잡아냅니다.
const SCENE_BUILD_BUDGET_MS = 9000

let layer: StreetSceneLayer
let elapsed = 0
let deferred = 0
beforeAll(() => {
  getPhotographedStreetBuildings()
  const started = performance.now()
  layer = new StreetSceneLayer()
  elapsed = performance.now() - started
  deferred = (layer as unknown as { pendingBuildings: unknown[] }).pendingBuildings.length
  // 지도에 붙으면 나눠 만들 나머지 건물을 테스트에서는 한 번에 채웁니다.
  layer.completePendingBuildings()
}, 120000)

describe('street scene', () => {
  it(`builds the first view within ${SCENE_BUILD_BUDGET_MS / 1000}s and defers the rest`, () => {
    expect(elapsed).toBeLessThan(SCENE_BUILD_BUDGET_MS)
    // 화면 중심에서 먼 건물은 생성자에서 만들지 않고 지도에 붙은 뒤 가까운 순서로 나눠 만듭니다.
    expect(deferred).toBeGreaterThan(getPhotographedStreetBuildings().length / 2)
    expect((layer as unknown as { pendingBuildings: unknown[] }).pendingBuildings.length).toBe(0)
  })

  it('hides every building except the artist workshop on request', () => {
    const rings = (layer as unknown as { buildingRings: THREE.Group[] }).buildingRings
    expect(rings.every((ring) => ring.children.length > 0)).toBe(true)
    layer.setOtherBuildingsHidden(true, false)
    expect(rings.every((ring) => !ring.visible)).toBe(true)
    layer.setOtherBuildingsHidden(false, false)
    expect(rings.every((ring) => ring.visible && ring.position.y === 0)).toBe(true)
    // 숨기는 묶음에는 공방 윤곽 안쪽의 도형이 없고, 공방은 늘 보이는 장면 쪽에 있습니다.
    const workshop = getPhotographedStreetBuildings().find((building) => building.id === ARTIST_WORKSHOP_FOOTPRINT_ID)!
    const outline = workshop.outline.map(streetMeters)
    const inside = ([x, z]: [number, number]) => {
      let result = false
      for (let index = 0, previous = outline.length - 1; index < outline.length; previous = index++) {
        const [ax, az] = outline[index], [bx, bz] = outline[previous]
        if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) result = !result
      }
      if (!result) return false
      // 이웃 건물의 벽은 맞닿은 경계선 위에 두께 절반만큼 걸쳐 그려지므로, 경계에서 0.3m 안쪽만 셉니다.
      return outline.every((start, index) => {
        const end = outline[(index + 1) % outline.length]
        const dx = end[0] - start[0], dz = end[1] - start[1]
        const t = Math.max(0, Math.min(1, ((x - start[0]) * dx + (z - start[1]) * dz) / (dx * dx + dz * dz)))
        return Math.hypot(x - start[0] - dx * t, z - start[1] - dz * t) > 0.3
      })
    }
    const pointsInsideWorkshop = (root: THREE.Object3D) => {
      let count = 0
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || object.parent !== root) return
        const position = object.geometry.getAttribute('position')
        for (let index = 0; index < position.count; index++) {
          if (position.getY(index) > 1 && inside([position.getX(index), position.getZ(index)])) count++
        }
      })
      return count
    }
    for (const ring of rings) expect(pointsInsideWorkshop(ring)).toBe(0)
    const scene = (layer as unknown as { scene: THREE.Scene }).scene
    expect(pointsInsideWorkshop(scene)).toBeGreaterThan(100)
  })
  it('makes every building except the workshop see-through and restores it', () => {
    const rings = (layer as unknown as { buildingRings: THREE.Group[] }).buildingRings
    const materials = () => rings.flatMap((ring) => ring.children)
      .filter((object): object is THREE.Mesh => object instanceof THREE.Mesh)
      .map((mesh) => mesh.material as THREE.Material)
    const solid = materials().filter((material) => !material.transparent)
    expect(solid.length).toBeGreaterThan(10)
    layer.setBuildingOpacity(0.35)
    expect(solid.every((material) => material.transparent && material.opacity === 0.35 && !material.depthWrite)).toBe(true)
    // 공방(장면에 바로 붙은 메시)은 반투명해지지 않습니다.
    const scene = (layer as unknown as { scene: THREE.Scene }).scene
    const workshopSolid = scene.children.filter((object): object is THREE.Mesh => object instanceof THREE.Mesh)
      .map((mesh) => mesh.material as THREE.Material).filter((material) => !material.transparent)
    expect(workshopSolid.length).toBeGreaterThan(0)
    layer.setBuildingOpacity(1)
    expect(solid.every((material) => !material.transparent && material.opacity === 1 && material.depthWrite)).toBe(true)
  })

  it('numbers every street building so it can fade on its own when it hides a road', () => {
    const occluders = (layer as unknown as { occluders: unknown[] }).occluders
    expect(occluders.length).toBeGreaterThan(100)
    const rings = (layer as unknown as { buildingRings: THREE.Group[] }).buildingRings
    const meshes = rings.flatMap((ring) => ring.children).filter((object): object is THREE.Mesh => object instanceof THREE.Mesh)
    // 묶어 그린 건물 메시에도 꼭짓점마다 건물 번호가 있고, 재질은 번호별 비침 정도를 읽습니다.
    const merged = meshes.filter((mesh) => mesh.geometry.getAttribute('position').count > 1000)
    expect(merged.length).toBeGreaterThan(5)
    for (const mesh of merged) {
      const index = mesh.geometry.getAttribute('buildingIndex')
      expect(index?.count).toBe(mesh.geometry.getAttribute('position').count)
      expect(index.getX(index.count - 1)).toBeLessThan(occluders.length)
    }
    // 같은 꼭짓점을 비치지 않는 건물(점무늬 없는 셰이더)과 비치는 건물(점무늬 셰이더) 두 메시가 나눠 그립니다.
    const fading = merged.filter((mesh) => (mesh.material as THREE.Material).customProgramCacheKey() === 'building-fade')
    const plain = merged.filter((mesh) => !fading.includes(mesh))
    expect(fading.length).toBe(plain.length)
    for (const mesh of plain) {
      const partner = fading.find((other) => other.geometry.getAttribute('position') === mesh.geometry.getAttribute('position'))!
      expect(partner).toBeDefined()
      expect(partner.geometry.index).toBe(mesh.geometry.index)
    }
  })

  it('moves only the buildings that hide a road to the dithered draw', () => {
    type Split = { runs: Int32Array; plain: THREE.Mesh; fade: THREE.Mesh }
    const internals = layer as unknown as { fadeSplits: Split[]; occluding: Set<number>; partition: (split: Split, force?: boolean) => void }
    const split = internals.fadeSplits.find((candidate) => candidate.runs.length >= 6)!
    const total = split.plain.geometry.getAttribute('position').count
    // 처음에는 아무 건물도 길을 가리지 않아 모두 점무늬 없는 메시로 그립니다.
    expect(split.plain.geometry.drawRange.count).toBe(total)
    expect(split.fade.visible).toBe(false)
    const [building, , count] = split.runs
    internals.occluding = new Set([building])
    internals.partition(split)
    expect(split.fade.visible).toBe(true)
    expect(split.fade.geometry.drawRange).toEqual({ start: total - count, count })
    expect(split.plain.geometry.drawRange.count).toBe(total - count)
    // 인덱스 앞쪽에는 그 건물의 꼭짓점이 없고, 뒤쪽에는 그 건물의 꼭짓점만 있습니다.
    const order = split.plain.geometry.index!.array
    const ids = split.plain.geometry.getAttribute('buildingIndex')
    expect([...order.slice(total - count)].every((vertex) => ids.getX(vertex) === building)).toBe(true)
    expect([...order.slice(0, total - count)].some((vertex) => ids.getX(vertex) === building)).toBe(false)
    internals.occluding = new Set()
    internals.partition(split)
    expect(split.fade.visible).toBe(false)
  })

  it('sinks the buildings into the ground ring by ring and raises them back', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    try {
      const rings = (layer as unknown as { buildingRings: THREE.Group[] }).buildingRings
      layer.setOtherBuildingsHidden(true)
      vi.advanceTimersByTime(300)
      // 공방에 가까운 고리가 먼저 내려가고, 바깥 고리는 아직 제자리입니다.
      expect(rings[0].position.y).toBeLessThan(-0.5)
      expect(rings[0].visible).toBe(true)
      expect(Math.abs(rings.at(-1)!.position.y)).toBeLessThan(1e-9)
      vi.advanceTimersByTime(2000)
      expect(rings.every((ring) => !ring.visible)).toBe(true)

      layer.setOtherBuildingsHidden(false)
      vi.advanceTimersByTime(300)
      expect(rings[0].visible).toBe(true)
      expect(rings[0].position.y).toBeLessThan(0)
      vi.advanceTimersByTime(2000)
      expect(rings.every((ring) => ring.visible && Math.abs(ring.position.y) < 1e-9)).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('rebuilds only the alley that changed and draws all alleys in two meshes', () => {
    const shapes = () => (layer as unknown as { extraAlleyShapes: Map<string, unknown> }).extraAlleyShapes
    const meshes = () => (layer as unknown as { extraAlleyMeshes: THREE.Mesh[] }).extraAlleyMeshes
    const alley = (index: number, width = 3) => ({ id: `a${index}`, widthMeters: width,
      coordinates: [[129.0068 + index * 0.0005, 35.0935], [129.0071 + index * 0.0005, 35.0937]] as [number, number][] })
    layer.setExtraAlleys([alley(0), alley(1), alley(2)])
    const before = [...shapes().values()]
    expect(before).toHaveLength(3)
    expect(meshes()).toHaveLength(2)
    layer.setExtraAlleys([alley(0), alley(1), alley(2, 5)])
    const after = [...shapes().values()]
    expect(after[0]).toBe(before[0])
    expect(after[1]).toBe(before[1])
    expect(after[2]).not.toBe(before[2])
    expect(meshes()[0].material).toBe((layer as unknown as { extraAlleyMaterials: THREE.Material[] }).extraAlleyMaterials[0])
    layer.setExtraAlleys([])
    expect(shapes().size).toBe(0)
    expect(meshes()).toHaveLength(0)
  })

  // 이 시험은 장면을 바꾸므로 맨 끝에 둡니다.
  it('rebuilds only the edited building and hides its old shape (with its shadow)', () => {
    type Split = { runs: Int32Array; plain: THREE.Mesh; fade: THREE.Mesh; index: THREE.BufferAttribute }
    const internals = layer as unknown as {
      map: unknown; fadeSplits: Split[]; fadeData: Uint8Array; occluders: unknown[]
      builtBuildings: Map<string, { spec: string; indices: number[] }>
    }
    internals.map = { triggerRepaint() {}, getBearing: () => 0, getPitch: () => 0 }
    const drawn = (index: number) => internals.fadeSplits.some((split) => {
      const order = split.index.array, ids = split.plain.geometry.getAttribute('buildingIndex')
      const visible = split.plain.geometry.drawRange.count + split.fade.geometry.drawRange.count
      for (let cursor = 0; cursor < visible; cursor++) if (ids.getX(order[cursor]) === index) return true
      return false
    })
    const target = getPhotographedStreetBuildings().find((building) => building.id !== ARTIST_WORKSHOP_FOOTPRINT_ID
      && (internals.builtBuildings.get(String(building.id))?.indices.length ?? 0) > 0)!
    const old = internals.builtBuildings.get(String(target.id))!.indices
    expect(drawn(old[0])).toBe(true)
    const before = internals.occluders.length
    const meshCount = layer['scene'].children.length

    expect(layer.updateBuildingEdits({ overrides: { [target.id]: { heightMeters: 30 } }, added: [], models: [] })).toBe(true)
    // 옛 모양은 어느 메시에서도 그리지 않고(그림자 포함) 점무늬도 완전히 비웁니다.
    expect(drawn(old[0])).toBe(false)
    expect(internals.fadeData[old[0] * 4]).toBe(0)
    // 새 모양 하나만 새 번호로 덧붙고, 다른 건물은 그대로입니다.
    const fresh = internals.builtBuildings.get(String(target.id))!.indices
    expect(internals.occluders.length - before).toBe(fresh.length)
    expect(drawn(fresh[0])).toBe(true)
    expect(layer['scene'].children.length).toBe(meshCount)

    // 숨기기만 하면 새로 만들지 않습니다.
    expect(layer.updateBuildingEdits({ overrides: { [target.id]: { hidden: true } }, added: [], models: [] })).toBe(true)
    expect(drawn(fresh[0])).toBe(false)
    expect(internals.builtBuildings.has(String(target.id))).toBe(false)

    // 한꺼번에 많이 바뀌면 통째로 다시 만들도록 false를 돌려줍니다.
    const many = Object.fromEntries([...internals.builtBuildings.keys()].filter((key) => /^\d+$/.test(key)).slice(0, 60)
      .map((key) => [key, { heightMeters: 20 }]))
    expect(layer.updateBuildingEdits({ overrides: many, added: [], models: [] })).toBe(false)
  })
})

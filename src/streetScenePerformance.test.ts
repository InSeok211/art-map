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
beforeAll(() => {
  getPhotographedStreetBuildings()
  const started = performance.now()
  layer = new StreetSceneLayer()
  elapsed = performance.now() - started
}, 60000)

describe('street scene', () => {
  it(`builds the first view within ${SCENE_BUILD_BUDGET_MS / 1000}s and defers the distant district`, () => {
    expect(elapsed).toBeLessThan(SCENE_BUILD_BUDGET_MS)
    // 거리에서 먼 건물은 생성자에서 만들지 않고 지도에 붙은 뒤 나눠 만듭니다.
    expect((layer as unknown as { pendingDistrict: unknown[] }).pendingDistrict.length).toBeGreaterThan(1000)
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
})

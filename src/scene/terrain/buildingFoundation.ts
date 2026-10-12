import * as THREE from 'three'
import type { TerrainSampler } from '../../map/terrain'
import { drapeOnTerrain, flatPolygonGeometry, TERRAIN_GROUND_LIFT } from '../groundGeometry'

type Outline = [number, number][]
type Terrain = Pick<TerrainSampler, 'height'>
const SAMPLE_EDGE = 2
const CLEARANCE = 0.02
const FOUNDATION_EMBED = 0.15

// shortcut: DEM을 2m 간격으로 보간한 추정 높이입니다. 실측 출입구 고도가 생기면 건물별 기준 높이로 바꿉니다.
export function buildingTerrainBase(outline: Outline, terrain?: Terrain) {
  if (!terrain || outline.length < 3) return 0
  const ground = drapeOnTerrain(flatPolygonGeometry([outline]), terrain, TERRAIN_GROUND_LIFT, SAMPLE_EDGE)
  const positions = ground.getAttribute('position')
  let highest = -Infinity
  for (let vertex = 0; vertex < positions.count; vertex++) highest = Math.max(highest, positions.getY(vertex))
  ground.dispose()
  return Number.isFinite(highest) ? highest + CLEARANCE : 0
}

// 건물 바닥을 y=0으로 두고, 수평 윗면과 지형까지 내려가는 기초 벽을 만듭니다.
export function buildingFoundationFaces(outline: Outline, base: number, terrain?: Terrain) {
  const faces: THREE.BufferGeometry[] = []
  if (!terrain || outline.length < 3) return faces
  const area = outline.reduce((sum, [x, z], index) => {
    const [nextX, nextZ] = outline[(index + 1) % outline.length]
    return sum + x * nextZ - nextX * z
  }, 0)
  for (let index = 0; index < outline.length; index++) {
    const a = outline[index], b = outline[(index + 1) % outline.length]
    const [start, end] = area > 0 ? [b, a] : [a, b]
    const dx = end[0] - start[0], dz = end[1] - start[1]
    const length = Math.hypot(dx, dz)
    if (length < 0.01) continue
    const normal = [-dz / length, 0, dx / length]
    const segments = Math.ceil(length / SAMPLE_EDGE)
    for (let step = 0; step < segments; step++) {
      const t0 = step / segments, t1 = (step + 1) / segments
      const p = [start[0] + dx * t0, start[1] + dz * t0]
      const q = [start[0] + dx * t1, start[1] + dz * t1]
      const groundP = terrain.height(p[0], p[1]) + TERRAIN_GROUND_LIFT - base
      const groundQ = terrain.height(q[0], q[1]) + TERRAIN_GROUND_LIFT - base
      if (Math.min(groundP, groundQ) >= -0.04) continue
      // 지면 삼각형과 보간 높이의 작은 차이에도 밑단에 틈이 나지 않도록 땅 안까지 넣습니다.
      const bottomP = Math.min(0, groundP - FOUNDATION_EMBED)
      const bottomQ = Math.min(0, groundQ - FOUNDATION_EMBED)
      const lowerP = [p[0], bottomP, p[1]], lowerQ = [q[0], bottomQ, q[1]]
      const upperP = [p[0], 0, p[1]], upperQ = [q[0], 0, q[1]]
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([...lowerP, ...lowerQ, ...upperQ, ...lowerP, ...upperQ, ...upperP], 3))
      // 2m당 한 번 반복해 기초 높이가 달라도 돌 줄눈의 크기를 유지합니다.
      const u0 = length * t0 / 2, u1 = length * t1 / 2
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute([u0, bottomP / 2, u1, bottomQ / 2, u1, 0, u0, bottomP / 2, u1, 0, u0, 0], 2))
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(Array(6).fill(normal).flat(), 3))
      faces.push(geometry)
    }
  }
  if (faces.length) {
    const top = flatPolygonGeometry([outline], -0.01, 2)
    faces.push(top.toNonIndexed())
    top.dispose()
  }
  return faces
}

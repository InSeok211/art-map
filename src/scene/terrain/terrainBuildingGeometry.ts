import * as THREE from 'three'
import type { TerrainSampler } from '../../map/terrain'
import { buildingTerrainBase } from './buildingFoundation'
import { TERRAIN_GROUND_LIFT } from '../groundGeometry'
import { streetMeters } from '../../map/streetCoordinates'
import type { TerrainBuildingSettings } from '../../buildings/buildingSettings'

type Point = [number, number]
type Terrain = Pick<TerrainSampler, 'height'>

// shortcut: 가까운 도로 면을 출입면으로 추정합니다. 실측 출입구 위치가 생기면 그 위치의 고도를 사용합니다.
export function terrainBuildingPlan(outline: Point[], terrain: Terrain, roadDistance: (x: number, z: number) => number,
  sharedEdges: readonly number[] = [], height?: number, settings?: TerrainBuildingSettings) {
  const area = outline.reduce((sum, [x, z], index) => {
    const [nextX, nextZ] = outline[(index + 1) % outline.length]
    return sum + x * nextZ - nextX * z
  }, 0)
  const sign = area > 0 ? 1 : -1
  const edges = outline.map((a, index) => {
    const b = outline[(index + 1) % outline.length]
    const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz)
    const x = (a[0] + b[0]) / 2, z = (a[1] + b[1]) / 2
    return { a, b, length, x, z, nx: dz / (length || 1) * sign, nz: -dx / (length || 1) * sign,
      shared: sharedEdges.includes(index), distance: roadDistance(x, z) }
  }).filter((edge) => edge.length >= 0.15)
  const candidates = edges.filter((edge) => !edge.shared && edge.length >= 1.5)
  const entrance = (candidates.length ? candidates : edges).reduce<typeof edges[number] | undefined>(
    (best, edge) => !best || edge.distance < best.distance ? edge : best, undefined)
  const point = settings?.entrance ? streetMeters(settings.entrance) : entrance ? [entrance.x, entrance.z] : undefined
  const entranceHeight = point ? terrain.height(point[0], point[1]) + TERRAIN_GROUND_LIFT + 0.02 : 0
  // 급경사에서도 지붕이 높은 쪽 땅에 묻히지 않도록 최소한의 벽 높이를 남깁니다.
  const automatic = height === undefined ? entranceHeight
    : Math.max(entranceHeight, buildingTerrainBase(outline, terrain) - height + 0.8)
  const base = (settings?.baseElevationMeters !== undefined ? settings.baseElevationMeters + TERRAIN_GROUND_LIFT : automatic)
    + (settings?.offsetMeters ?? 0)
  return { base, edges, entrance }
}

// 수평 지붕 아래에서 벽 밑단만 지형을 따라갑니다. 좌표는 건물 기준 바닥(base)에 대한 상대 높이입니다.
export function terrainWallGeometry(a: Point, b: Point, nx: number, nz: number, base: number, top: number,
  terrain: Terrain, tileWidth = 2.4, tileHeight = 1.2) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1])
  const [p, q] = (b[0] - a[0]) * nz - (b[1] - a[1]) * nx < 0 ? [b, a] : [a, b]
  const count = Math.max(1, Math.ceil(length / 2))
  const positions: number[] = [], uvs: number[] = [], normals: number[] = []
  for (let segment = 0; segment < count; segment++) {
    const t0 = segment / count, t1 = (segment + 1) / count
    const x0 = p[0] + (q[0] - p[0]) * t0, z0 = p[1] + (q[1] - p[1]) * t0
    const x1 = p[0] + (q[0] - p[0]) * t1, z1 = p[1] + (q[1] - p[1]) * t1
    const bottom0 = Math.min(top, terrain.height(x0, z0) + TERRAIN_GROUND_LIFT - base - 0.15)
    const bottom1 = Math.min(top, terrain.height(x1, z1) + TERRAIN_GROUND_LIFT - base - 0.15)
    positions.push(x0, bottom0, z0, x1, bottom1, z1, x1, top, z1, x0, bottom0, z0, x1, top, z1, x0, top, z0)
    const u0 = length * t0 / tileWidth, u1 = length * t1 / tileWidth
    const v0 = bottom0 / tileHeight, v1 = bottom1 / tileHeight, vt = top / tileHeight
    uvs.push(u0, v0, u1, v1, u1, vt, u0, v0, u1, vt, u0, vt)
    for (let vertex = 0; vertex < 6; vertex++) normals.push(nx, 0, nz)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  return geometry
}

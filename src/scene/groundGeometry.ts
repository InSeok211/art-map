import * as THREE from 'three'
import type { TerrainSampler } from '../map/terrain'

// 3D 거리 바닥(길·포장·경로 선)의 도형 도우미입니다.

// 3D 지형에서 바닥(길·포장)을 지형 위로 띄우는 높이(m). 바탕 지도의 지형 면과 겹쳐 깜빡이지 않게 합니다.
export const TERRAIN_GROUND_LIFT = 0.35

// 장면 미터 다각형(바깥 고리 + 구멍 고리들)을 높이 y에 눕힌 납작한 도형으로 만듭니다. 바닥 무늬처럼 질감 한
// 장이 여러 m를 덮어야 하면 uvMeters(질감 한 장의 크기, m)를 줍니다. closeOuter: 바깥 고리를 닫아 그립니다(지붕).
// 닫느냐에 따라 삼각형 나누는 방식이 달라지므로 예전 결과를 그대로 유지하려고 따로 둡니다.
type PlanePolygon = readonly (readonly [number, number][])[]
export const isDrawablePolygon = (polygon: PlanePolygon) => (polygon[0]?.length ?? 0) >= 4
export function flatPolygonGeometry(polygon: PlanePolygon, y = 0, uvMeters?: number, closeOuter = false) {
  const trace = (path: THREE.Path, ring: readonly [number, number][]) =>
    ring.forEach(([x, z], index) => index === 0 ? path.moveTo(x, -z) : path.lineTo(x, -z))
  const shape = new THREE.Shape()
  trace(shape, polygon[0])
  if (closeOuter) shape.closePath()
  for (const ring of polygon.slice(1)) {
    const hole = new THREE.Path()
    trace(hole, ring)
    shape.holes.push(hole)
  }
  const geometry = new THREE.ShapeGeometry(shape)
  if (uvMeters) {
    const uv = geometry.getAttribute('uv')
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / uvMeters, uv.getY(i) / uvMeters)
  }
  geometry.rotateX(-Math.PI / 2)
  geometry.translate(0, y, 0)
  return geometry
}

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

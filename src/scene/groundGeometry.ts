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
  const steps = drapeOnTerrainSteps(geometry, terrain, lift, maxEdge)
  for (;;) {
    const step = steps.next()
    if (step.done) return step.value
  }
}

// drapeOnTerrain을 조금씩 나눠 합니다(삼각형 수천 개·꼭짓점 수천 개마다 쉼). 지도 전체 바닥판처럼 큰 면을 한 번에
// 얹으면 화면이 0.5초 넘게 멈추기 때문입니다. 결과는 drapeOnTerrain과 같습니다.
const DRAPE_STEP = 4000
// expand: 인덱스 없이 삼각형마다 꼭짓점을 펼친 도형으로 돌려줍니다(3D 거리 바닥이 쓰는 모양, toNonIndexed와 같음).
// 법선은 펼치기 전에 이웃 삼각형과 함께 계산하므로 비탈이 매끈하게 보입니다.
export function* drapeOnTerrainSteps(geometry: THREE.BufferGeometry, terrain: Pick<TerrainSampler, 'height'>, lift = TERRAIN_GROUND_LIFT, maxEdge = 6, expand = false): Generator<void, THREE.BufferGeometry> {
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
  let work = 0
  while (stack.length >= 3) {
    if (++work % DRAPE_STEP === 0) yield
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
  for (let vertex = 0; vertex < vertices; vertex++) {
    pool[vertex * stride + positionOffset + 1] += terrain.height(x(vertex), z(vertex)) + lift
    if (vertex % DRAPE_STEP === DRAPE_STEP - 1) yield
  }
  // 법선: 면 법선(넓이 가중)을 꼭짓점마다 더한 뒤 길이 1로 맞춥니다(BufferGeometry.computeVertexNormals와 같음).
  const normalIndex = names.indexOf('normal')
  if (normalIndex >= 0) {
    const normalOffset = sizes.slice(0, normalIndex).reduce((sum, size) => sum + size, 0)
    const sums = new Float32Array(vertices * 3)
    const p = (vertex: number, axis: number) => pool[vertex * stride + positionOffset + axis]
    for (let i = 0; i < triangles.length; i += 3) {
      const a = triangles[i], b = triangles[i + 1], c = triangles[i + 2]
      const abx = p(b, 0) - p(a, 0), aby = p(b, 1) - p(a, 1), abz = p(b, 2) - p(a, 2)
      const cbx = p(c, 0) - p(b, 0), cby = p(c, 1) - p(b, 1), cbz = p(c, 2) - p(b, 2)
      // (c - b) × (a - b): three.js와 같은 방향
      const nx = cby * -abz - cbz * -aby, ny = cbz * -abx - cbx * -abz, nz = cbx * -aby - cby * -abx
      for (const vertex of [a, b, c]) { sums[vertex * 3] += nx; sums[vertex * 3 + 1] += ny; sums[vertex * 3 + 2] += nz }
      if (i % (DRAPE_STEP * 3) === 0) yield
    }
    for (let vertex = 0; vertex < vertices; vertex++) {
      const length = Math.hypot(sums[vertex * 3], sums[vertex * 3 + 1], sums[vertex * 3 + 2]) || 1
      for (let k = 0; k < 3; k++) pool[vertex * stride + normalOffset + k] = sums[vertex * 3 + k] / length
      if (vertex % DRAPE_STEP === DRAPE_STEP - 1) yield
    }
  }
  const result = new THREE.BufferGeometry()
  let offset = 0
  for (const [a, name] of names.entries()) {
    const size = sizes[a]
    if (expand) {
      const values = new Float32Array(triangles.length * size)
      for (let corner = 0; corner < triangles.length; corner++) {
        const source = triangles[corner] * stride + offset
        for (let k = 0; k < size; k++) values[corner * size + k] = pool[source + k]
        if (corner % DRAPE_STEP === DRAPE_STEP - 1) yield
      }
      result.setAttribute(name, new THREE.Float32BufferAttribute(values, size))
    } else {
      const values = new Float32Array(vertices * size)
      for (let vertex = 0; vertex < vertices; vertex++) {
        for (let k = 0; k < size; k++) values[vertex * size + k] = pool[vertex * stride + offset + k]
        if (vertex % DRAPE_STEP === DRAPE_STEP - 1) yield
      }
      result.setAttribute(name, new THREE.Float32BufferAttribute(values, size))
    }
    offset += size
  }
  if (!expand) result.setIndex(triangles)
  geometry.dispose()
  return result
}

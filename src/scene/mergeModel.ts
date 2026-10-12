import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// 불러온 모델(GLB)의 부품을 같은 재질끼리 한 메시로 합칩니다. 그린하우스·아름다운한글 모델은 창살·판자·화분 같은
// 작은 부품 수백 개가 따로 그려져, 삼각형은 1.6만 개뿐인데 그리기 명령이 한 프레임에 870번 가까이 나갔습니다
// (3D 거리 전체의 85%). 부품의 위치·회전·크기를 도형에 반영해 합치므로 모양은 그대로입니다.
// 여러 재질을 쓰는 부품·모양 변형(morph)·뼈대가 있는 부품은 합치지 않고 그대로 둡니다.
export function mergeByMaterial(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true)
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const merged = new THREE.Group()
  merged.name = root.name
  const buckets = new globalThis.Map<string, { material: THREE.Material; geometries: THREE.BufferGeometry[] }>()
  const kept: THREE.Object3D[] = []
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const geometry = object.geometry as THREE.BufferGeometry
    if (Array.isArray(object.material) || object instanceof THREE.SkinnedMesh || object instanceof THREE.InstancedMesh
      || Object.keys(geometry.morphAttributes).length || !geometry.getAttribute('position')) {
      kept.push(object)
      return
    }
    const matrix = new THREE.Matrix4().multiplyMatrices(toRoot, object.matrixWorld)
    const placed = flatCopy(geometry).applyMatrix4(matrix)
    // 좌우가 뒤집힌 부품은 면이 안팎으로 뒤집히므로 삼각형 꼭짓점 순서를 바꿔 바로잡습니다.
    if (matrix.determinant() < 0) flipWinding(placed)
    const signature = Object.entries(placed.attributes)
      .map(([name, attribute]) => `${name}:${attribute.itemSize}`)
      .sort().join(',')
    const key = `${object.material.uuid}|${signature}`
    let bucket = buckets.get(key)
    if (!bucket) buckets.set(key, bucket = { material: object.material, geometries: [] })
    bucket.geometries.push(placed)
  })
  for (const { material, geometries } of buckets.values()) {
    const geometry = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries)
    if (geometries.length > 1) geometries.forEach((part) => part.dispose())
    if (geometry) merged.add(new THREE.Mesh(geometry, material))
  }
  // 합치지 못한 부품은 루트 기준 위치를 그대로 지켜 붙입니다.
  for (const object of kept) {
    const matrix = new THREE.Matrix4().multiplyMatrices(toRoot, object.matrixWorld)
    object.removeFromParent()
    matrix.decompose(object.position, object.quaternion, object.scale)
    merged.add(object)
  }
  return merged
}

// 인덱스를 풀고 모든 속성을 일반 실수 배열로 복사합니다. GLB는 속성을 한 버퍼에 섞어 두거나(interleaved) 정수로
// 압축해(normalized) 두기도 하는데, 그대로 변형·합치면 값이 깨지기 때문입니다.
function flatCopy(geometry: THREE.BufferGeometry) {
  const index = geometry.index
  const count = index ? index.count : geometry.getAttribute('position').count
  const result = new THREE.BufferGeometry()
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const size = attribute.itemSize
    const values = new Float32Array(count * size)
    for (let i = 0; i < count; i++) {
      const vertex = index ? index.getX(i) : i
      for (let k = 0; k < size; k++) values[i * size + k] = attribute.getComponent(vertex, k)
    }
    result.setAttribute(name, new THREE.BufferAttribute(values, size))
  }
  return result
}

function flipWinding(geometry: THREE.BufferGeometry) {
  for (const attribute of Object.values(geometry.attributes)) {
    const size = attribute.itemSize
    const array = attribute.array as unknown as number[]
    for (let first = 0; first + 3 * size <= array.length; first += 3 * size) {
      for (let k = 0; k < size; k++) {
        const second = first + size + k, third = first + 2 * size + k
        const value = array[second]
        array[second] = array[third]
        array[third] = value
      }
    }
    attribute.needsUpdate = true
  }
}

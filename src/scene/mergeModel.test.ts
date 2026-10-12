import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { mergeByMaterial } from './mergeModel'

const triangle = () => {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3))
  geometry.setIndex([0, 1, 2])
  return geometry
}
const faceNormal = (geometry: THREE.BufferGeometry, triangleIndex = 0) => {
  const position = geometry.getAttribute('position')
  const [a, b, c] = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(position, triangleIndex * 3 + k))
  return new THREE.Vector3().crossVectors(b.sub(a), c.sub(a)).normalize()
}
const worldPositions = (root: THREE.Object3D) => {
  root.updateMatrixWorld(true)
  const points: number[][] = []
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const position = object.geometry.getAttribute('position')
    const index = object.geometry.index
    const count = index ? index.count : position.count
    for (let i = 0; i < count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(object.matrixWorld)
      points.push(point.toArray().map((value) => Math.round(value * 1000) / 1000))
    }
  })
  return points.sort().join('|')
}

describe('mergeByMaterial', () => {
  it('merges parts by material and keeps every vertex where it was', () => {
    const red = new THREE.MeshBasicMaterial({ color: 0xff0000 })
    const blue = new THREE.MeshBasicMaterial({ color: 0x0000ff })
    const root = new THREE.Group()
    const nested = new THREE.Group()
    nested.position.set(5, 0, 0)
    nested.rotation.y = Math.PI / 3
    root.add(nested)
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(triangle(), i % 2 ? red : blue)
      mesh.position.set(i, i * 2, -i)
      mesh.scale.setScalar(1 + i * 0.5)
      ;(i < 2 ? root : nested).add(mesh)
    }
    const merged = mergeByMaterial(root)
    expect(merged.children).toHaveLength(2)
    expect(new Set(merged.children.map((child) => (child as THREE.Mesh).material))).toEqual(new Set([red, blue]))
    expect(worldPositions(merged)).toBe(worldPositions(root))
  })

  it('keeps mirrored parts facing outward', () => {
    const material = new THREE.MeshBasicMaterial()
    const root = new THREE.Group()
    const normal = new THREE.Mesh(triangle(), material)
    const mirrored = new THREE.Mesh(triangle(), material)
    mirrored.scale.set(-1, 1, 1)
    root.add(normal, mirrored)
    const merged = mergeByMaterial(root).children[0] as THREE.Mesh
    // 원래 삼각형은 +z를 향하고, 거울에 비춘 삼각형도 같은 쪽(+z)을 향해야 합니다.
    expect(faceNormal(merged.geometry, 0).z).toBeCloseTo(1)
    expect(faceNormal(merged.geometry, 1).z).toBeCloseTo(1)
  })

  it('reads compressed (normalized) attributes as real values', () => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Int16Array([0, 0, 0, 32767, 0, 0, 0, 32767, 0]), 3, true))
    const root = new THREE.Group()
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
    mesh.scale.setScalar(10)
    root.add(mesh)
    const merged = mergeByMaterial(root).children[0] as THREE.Mesh
    expect(Array.from(merged.geometry.getAttribute('position').array).map((value) => Math.round(value))).toEqual([0, 0, 0, 10, 0, 0, 0, 10, 0])
  })

  it('leaves multi-material parts as they are', () => {
    const root = new THREE.Group()
    const mesh = new THREE.Mesh(triangle(), [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()])
    mesh.position.set(1, 2, 3)
    root.add(mesh)
    const merged = mergeByMaterial(root)
    expect(merged.children).toEqual([mesh])
    expect(mesh.position.toArray()).toEqual([1, 2, 3])
  })
})

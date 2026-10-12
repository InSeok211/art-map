import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { pickBuilding } from './buildingPicking'

const setup = () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  camera.position.set(0, 2, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true)
  const geometry = new THREE.BoxGeometry(3, 4, 3)
  geometry.setAttribute('pickIndex', new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count).fill(0), 1))
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
  scene.add(mesh)
  return { scene, camera, mesh }
}
describe('3D building selection', () => {
  it('maps a clicked roof or wall back to an exact large building ID', () => {
    const { scene, camera } = setup()
    expect(pickBuilding(scene, camera, [{ kind: 'osm', id: 14685906441 }], 100, 100, 200, 200)).toEqual({ kind: 'osm', id: 14685906441 })
  })
  it('skips hidden groups and buried surfaces', () => {
    const { scene, camera, mesh } = setup(), group = new THREE.Group()
    scene.add(group); group.add(mesh); group.visible = false
    expect(pickBuilding(scene, camera, [{ kind: 'osm', id: 123 }], 100, 100, 200, 200)).toBeNull()
    group.visible = true
    expect(pickBuilding(scene, camera, [{ kind: 'osm', id: 123 }], 100, 100, 200, 200, () => 20)).toBeNull()
  })
  it('selects a GLB placement using its parent ID', () => {
    const { scene, camera, mesh } = setup(), group = new THREE.Group()
    scene.add(group); group.add(mesh); mesh.geometry.deleteAttribute('pickIndex')
    group.userData.buildingPick = { kind: 'model', id: 'p-model' }
    mesh.userData.buildingPick = { kind: 'osm', id: 999 }
    expect(pickBuilding(scene, camera, [], 100, 100, 200, 200)).toEqual({ kind: 'model', id: 'p-model' })
  })
})

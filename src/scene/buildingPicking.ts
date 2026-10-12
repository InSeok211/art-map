import * as THREE from 'three'
import type { BuildingSelection } from '../buildings/buildingSelection'

function objectSelection(object: THREE.Object3D): BuildingSelection | undefined {
  let selection: BuildingSelection | undefined
  for (let current: THREE.Object3D | null = object; current; current = current.parent) {
    if (current.userData.buildingPick) selection = current.userData.buildingPick as BuildingSelection
  }
  return selection
}

export function pickBuilding(scene: THREE.Scene, camera: THREE.Camera, references: readonly BuildingSelection[],
  x: number, y: number, width: number, height: number, ground?: (x: number, z: number) => number): BuildingSelection | null {
  if (!width || !height) return null
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
  const near = new THREE.Vector3(x / width * 2 - 1, 1 - y / height * 2, -1).unproject(camera)
  const far = new THREE.Vector3(x / width * 2 - 1, 1 - y / height * 2, 1).unproject(camera)
  const raycaster = new THREE.Raycaster(near, far.sub(near).normalize())
  const meshes: THREE.Mesh[] = []
  scene.updateMatrixWorld(true)
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    for (let current: THREE.Object3D | null = object; current; current = current.parent) if (!current.visible) return
    const index = object.geometry.getAttribute('pickIndex') as THREE.BufferAttribute | undefined
    const pickable = object.userData.pickable ??= !!objectSelection(object)
      || !!index && (index.array as Float32Array).some((value) => value >= 0)
    if (pickable) meshes.push(object)
  })
  for (const hit of raycaster.intersectObjects(meshes, false)) {
    if (ground && hit.point.y < ground(hit.point.x, hit.point.z) - 0.2) continue
    const selection = objectSelection(hit.object)
    if (selection) return selection
    const index = (hit.object as THREE.Mesh).geometry.getAttribute('pickIndex')
    if (index && hit.face) {
      const reference = references[Math.round(index.getX(hit.face.a))]
      if (reference) return reference
    }
  }
  return null
}

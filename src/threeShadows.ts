import * as THREE from 'three'

// 거리 장면과 3D 모델 레이어가 같은 태양 방향·하늘빛·톤을 쓰도록 공유하는 조명 설정입니다.
// 남동쪽 태양이라 첫 화면(남→북 시점)에서 그림자가 건물 왼쪽(북서쪽)으로 보입니다.
export const SUN_DIRECTION = new THREE.Vector3(150, 150, 90).normalize()

export function addSceneLights(scene: THREE.Scene, center: [number, number], extent: number, mapSize: number) {
  scene.add(new THREE.HemisphereLight(0xeaf3ff, 0xb8aa92, 1.35))
  scene.add(new THREE.AmbientLight(0xffffff, 0.35))
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.7)
  sun.castShadow = true
  sun.shadow.mapSize.set(mapSize, mapSize)
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.04
  sun.shadow.radius = 3
  scene.add(sun, sun.target)
  aimSun(sun, center, extent)
  return sun
}

// 그림자를 계산할 사각 범위(장면 미터)의 중심과 반폭에 맞춰 태양과 그림자 카메라를 둡니다.
export function aimSun(sun: THREE.DirectionalLight, [x, z]: [number, number], extent: number) {
  const distance = extent * 1.2 + 60
  sun.position.set(x + SUN_DIRECTION.x * distance, SUN_DIRECTION.y * distance, z + SUN_DIRECTION.z * distance)
  sun.target.position.set(x, 0, z)
  const camera = sun.shadow.camera
  camera.left = -extent
  camera.right = extent
  camera.top = extent
  camera.bottom = -extent
  camera.near = 1
  camera.far = distance * 2
  camera.updateProjectionMatrix()
}

export function configureRenderer(renderer: THREE.WebGLRenderer) {
  renderer.autoClear = false
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  // 장면이 바뀔 때만 그림자 지도를 다시 계산합니다(bakeShadowMap).
  renderer.shadowMap.enabled = true
  // three r18x에서 PCFSoftShadowMap이 없어져 PCFShadowMap으로 바뀌므로 처음부터 그것을 지정합니다.
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.shadowMap.autoUpdate = false
}

// 지도 바닥(MapLibre)에는 Three 그림자가 떨어지지 않으므로, 그림자만 그리는 투명 판을 깝니다.
export function createShadowCatcher() {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.ShadowMaterial({ color: 0x1c2733, opacity: 0.34, depthWrite: false }))
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  mesh.renderOrder = 1
  return mesh
}

export function fitShadowCatcher(mesh: THREE.Mesh, minX: number, maxX: number, minZ: number, maxZ: number, y = 0.03) {
  mesh.scale.set(maxX - minX, 1, maxZ - minZ)
  mesh.position.set((minX + maxX) / 2, y, (minZ + maxZ) / 2)
}

// MapLibre는 레이어마다 gl.depthRange를 좁혀 두는데, Three의 그림자 지도는 0~1 전체 깊이를 전제로
// 깊이를 비교합니다. 깊이 범위를 되돌린 채 1×1 임시 대상에 한 번 그려 그림자 지도만 새로 만듭니다.
export function bakeShadowMap(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, gl: WebGL2RenderingContext) {
  const depthRange = gl.getParameter(gl.DEPTH_RANGE) as Float32Array
  const target = new THREE.WebGLRenderTarget(1, 1)
  gl.depthRange(0, 1)
  renderer.shadowMap.needsUpdate = true
  renderer.setRenderTarget(target)
  renderer.render(scene, camera)
  renderer.setRenderTarget(null)
  gl.depthRange(depthRange[0], depthRange[1])
  target.dispose()
}

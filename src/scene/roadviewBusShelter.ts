import * as THREE from 'three'

// 감천문화마을·부산교육역사관(구감 방면), 카카오 로드뷰 2025-11 참고.
// 쉘터의 색과 구조는 현장 관찰에 맞추고, 정확한 실측치가 없는 크기는 추정값이다.
// 도로는 local -Z 방향, 쉘터의 긴 변은 local X 방향이다.
export function createRoadviewBusShelter() {
  const shelter = new THREE.Group()
  shelter.name = '감천문화마을 구감 방면 버스 쉘터'

  const metal = new THREE.MeshLambertMaterial({ color: 0x466b68 })
  const roof = new THREE.MeshLambertMaterial({ color: 0x417c75 })
  const dark = new THREE.MeshLambertMaterial({ color: 0x344d4d })
  const pale = new THREE.MeshLambertMaterial({ color: 0xe5e9e3 })
  const blue = new THREE.MeshLambertMaterial({ color: 0x2879ad })
  const red = new THREE.MeshLambertMaterial({ color: 0xb71e25 })
  const steel = new THREE.MeshStandardMaterial({ color: 0xa8aaa4, metalness: 0.15, roughness: 0.56 })
  const glass = new THREE.MeshStandardMaterial({ color: 0xbad6d1, transparent: true, opacity: 0.32, roughness: 0.25, metalness: 0.05, depthWrite: false, side: THREE.DoubleSide })

  function box(material: THREE.Material, width: number, height: number, depth: number, x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
    mesh.position.set(x, y, z)
    mesh.castShadow = material !== glass
    mesh.receiveShadow = true
    shelter.add(mesh)
    return mesh
  }

  // 네 모서리의 가는 금속 기둥, 투명한 후면과 양쪽 측면.
  for (const x of [-1.31, 1.31]) for (const z of [-0.54, 0.54])
    box(metal, 0.07, 2.17, 0.07, x, 1.085, z)
  box(glass, 2.54, 1.62, 0.018, 0, 1.17, 0.54)
  for (const x of [-1.31, 1.31]) box(glass, 0.018, 1.62, 1.0, x, 1.17, 0)
  box(metal, 2.68, 0.045, 0.045, 0, 1.86, 0.54)
  box(metal, 2.68, 0.045, 0.045, 0, 0.55, 0.54)

  // 로드뷰에 보이는 완만한 지붕 곡선을 얇은 판 세 개로 표현한다.
  for (const [z, y, angle] of [[-0.43, 2.29, -0.07], [0, 2.32, 0], [0.43, 2.29, 0.07]] as const) {
    const panel = box(roof, 2.86, 0.07, 0.48, 0, y, z)
    panel.rotation.x = angle
  }
  box(dark, 2.86, 0.17, 0.045, 0, 2.20, -0.63)
  for (const x of [-0.94, -0.31, 0.31, 0.94]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.016, 5, 12), pale)
    ring.position.set(x, 2.20, -0.658)
    shelter.add(ring)
  }

  // 지붕 위 물결형 금속 조형물과 붉은 상자는 이 정류장의 현장 특징이다.
  const wave = new THREE.CatmullRomCurve3([
    new THREE.Vector3(1.16, 4.45, 0.27),
    new THREE.Vector3(1.02, 3.83, 0.27),
    new THREE.Vector3(0.69, 3.55, 0.27),
    new THREE.Vector3(0.13, 3.34, 0.27),
    new THREE.Vector3(-0.20, 2.91, 0.27),
    new THREE.Vector3(-0.74, 2.78, 0.27),
    new THREE.Vector3(-1.02, 2.52, 0.27),
  ])
  const sculpture = new THREE.Mesh(new THREE.TubeGeometry(wave, 24, 0.09, 6, false), steel)
  sculpture.castShadow = true
  shelter.add(sculpture)
  box(red, 0.43, 0.38, 0.33, -0.62, 2.77, 0.17)

  // 뒤쪽 시간표, 벤치. 글자나 노선은 확인되지 않아 넣지 않는다.
  box(pale, 0.54, 0.78, 0.025, -0.81, 1.33, 0.515)
  box(blue, 0.54, 0.13, 0.028, -0.81, 1.68, 0.495)
  box(dark, 1.5, 0.08, 0.35, 0.42, 0.49, 0.28)
  for (const x of [-0.24, 1.08]) box(metal, 0.07, 0.46, 0.07, x, 0.23, 0.28)

  // 쉘터 옆 독립형 정류장 표지. 로드뷰에서 읽히지 않는 노선 정보는 생략한다.
  box(dark, 0.08, 2.55, 0.08, 1.92, 1.275, -1.20)
  box(blue, 0.44, 0.56, 0.09, 1.92, 2.31, -1.20)
  box(pale, 0.32, 0.20, 0.095, 1.92, 2.39, -1.20)

  shelter.rotation.y = Math.PI / 2
  return shelter
}

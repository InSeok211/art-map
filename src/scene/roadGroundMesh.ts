import * as THREE from 'three'
import { flatPolygonGeometry, isDrawablePolygon } from './groundGeometry'
import type { RoadGround } from './roadGround'

// 도로·보도 면(road-ground.json의 다각형)을 삼각형으로 나눈 결과를 미리 계산해 둔 바이너리입니다.
// 예전에는 지도를 열 때마다 구멍이 313개인 바깥 면 등을 earcut으로 나눠 0.2초 넘게 멈췄고(끊을 수 없는 한 단계),
// 다각형 JSON 1.1MB가 자바스크립트 번들에 객체 리터럴로 들어가 파싱도 느렸습니다. 이제 npm run build:road-ground가
// 삼각분할까지 끝낸 꼭짓점·인덱스를 .bin으로 쓰고, 지도는 그 파일을 따로 받아 TypedArray로 바로 씁니다.
//
// 파일 구조(리틀 엔디언): 'GRMH' | 헤더 길이(uint32) | 헤더 JSON(utf-8, 4바이트 정렬) | 꼭짓점 xz(float32 × 2) | 인덱스(uint16)
// 인덱스는 다각형마다 그 다각형의 첫 꼭짓점부터 세므로 uint16(최대 65,535점)으로 충분합니다.

/** 바닥 무늬(돌·포장 질감) 한 장이 덮는 크기(m). uv를 여기서 계산하므로 StreetSceneLayer와 같은 값을 써야 합니다. */
export const GROUND_TEXTURE_METERS = 20

export const ROAD_GROUND_GROUPS = ['outer', 'roads', 'footways', 'kerbStone', 'kerbLine', 'meeting'] as const
export type RoadGroundGroup = (typeof ROAD_GROUND_GROUPS)[number]

/** 다각형 하나의 꼭짓점·인덱스가 전체 배열에서 차지하는 범위 */
export interface MeshRange { vertexOffset: number; vertexCount: number; indexOffset: number; indexCount: number }

export interface RoadGroundMesh {
  inputsHash: string
  /** 꼭짓점 (x, z) 쌍. y는 그릴 때 정합니다. */
  positions: Float32Array
  /** 삼각형 인덱스(다각형 범위 안에서 0부터) */
  indices: Uint16Array
  groups: Record<RoadGroundGroup, MeshRange[]>
}

const MAGIC = 'GRMH'
const MAX_VERTICES_PER_POLYGON = 65535

type Header = { inputsHash: string; vertexCount: number; indexCount: number; groups: Record<RoadGroundGroup, MeshRange[]> }

/** 빌드 스크립트용: 미리 계산한 바닥 다각형을 삼각형으로 나눠 바이너리로 묶습니다. 지도가 쓰던 flatPolygonGeometry와 같은 결과입니다. */
export function encodeRoadGroundMesh(ground: RoadGround, inputsHash: string): Uint8Array {
  const positions: number[] = []
  const indices: number[] = []
  const groups = {} as Record<RoadGroundGroup, MeshRange[]>
  for (const group of ROAD_GROUND_GROUPS) {
    groups[group] = []
    for (const polygon of ground[group]) {
      if (!isDrawablePolygon(polygon)) continue
      const geometry = flatPolygonGeometry(polygon, 0, GROUND_TEXTURE_METERS)
      const position = geometry.getAttribute('position')
      const index = geometry.getIndex()
      if (!index) throw new Error('flatPolygonGeometry가 인덱스 없는 도형을 돌려줬습니다')
      if (position.count > MAX_VERTICES_PER_POLYGON) throw new Error(`${group} 다각형의 꼭짓점이 ${position.count}개라 uint16 인덱스를 넘습니다`)
      const range: MeshRange = { vertexOffset: positions.length / 2, vertexCount: position.count, indexOffset: indices.length, indexCount: index.count }
      for (let i = 0; i < position.count; i++) positions.push(position.getX(i), position.getZ(i))
      for (let i = 0; i < index.count; i++) indices.push(index.getX(i))
      groups[group].push(range)
      geometry.dispose()
    }
  }
  const header: Header = { inputsHash, vertexCount: positions.length / 2, indexCount: indices.length, groups }
  const headerBytes = new TextEncoder().encode(JSON.stringify(header))
  const headerPadded = Math.ceil(headerBytes.length / 4) * 4
  const positionBytes = positions.length * 4
  const buffer = new ArrayBuffer(8 + headerPadded + positionBytes + indices.length * 2)
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  bytes.set(new TextEncoder().encode(MAGIC), 0)
  view.setUint32(4, headerBytes.length, true)
  bytes.set(headerBytes, 8)
  new Float32Array(buffer, 8 + headerPadded, positions.length).set(positions)
  new Uint16Array(buffer, 8 + headerPadded + positionBytes, indices.length).set(indices)
  return bytes
}

export function decodeRoadGroundMesh(buffer: ArrayBufferLike): RoadGroundMesh {
  const bytes = new Uint8Array(buffer)
  if (new TextDecoder().decode(bytes.subarray(0, 4)) !== MAGIC) throw new Error('road-ground-mesh.bin 형식이 아닙니다')
  const headerLength = new DataView(buffer).getUint32(4, true)
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + headerLength))) as Header
  const headerPadded = Math.ceil(headerLength / 4) * 4
  const positions = new Float32Array(buffer, 8 + headerPadded, header.vertexCount * 2)
  const indices = new Uint16Array(buffer, 8 + headerPadded + header.vertexCount * 8, header.indexCount)
  return { inputsHash: header.inputsHash, positions, indices, groups: header.groups }
}

/** 다각형 하나를 높이 y에 눕힌 도형으로 만듭니다(예전 flatPolygonGeometry(polygon, y, GROUND_TEXTURE_METERS)와 같은 꼭짓점·uv·법선). */
export function roadGroundMeshGeometry(mesh: RoadGroundMesh, range: MeshRange, y: number) {
  const count = range.vertexCount
  const position = new Float32Array(count * 3)
  const normal = new Float32Array(count * 3)
  const uv = new Float32Array(count * 2)
  for (let i = 0; i < count; i++) {
    const x = mesh.positions[(range.vertexOffset + i) * 2]
    const z = mesh.positions[(range.vertexOffset + i) * 2 + 1]
    position[i * 3] = x; position[i * 3 + 1] = y; position[i * 3 + 2] = z
    normal[i * 3 + 1] = 1
    uv[i * 2] = x / GROUND_TEXTURE_METERS; uv[i * 2 + 1] = -z / GROUND_TEXTURE_METERS
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices.slice(range.indexOffset, range.indexOffset + range.indexCount), 1))
  return geometry
}

// 지도 앱은 roadGroundMeshLoader.ts로 파일을 받아 StreetSceneLayer에 넘기고, 테스트처럼 fetch 없이 쓰는 곳은
// 파일을 읽어 여기에 넣어 둡니다. (이 모듈은 빌드 스크립트도 Node에서 묶어 쓰므로 Vite 전용 import를 두지 않습니다.)
let provided: RoadGroundMesh | null = null
export function setRoadGroundMesh(mesh: RoadGroundMesh | null) { provided = mesh }
export function getRoadGroundMesh() { return provided }

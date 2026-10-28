import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { colorBytes, SlotBuffer, UNIT_BEAM, UNIT_BOX } from './slotBuffer'
import type { BoxUvTile } from './slotBuffer'

// 새 버퍼가 예전 방식(BufferGeometry를 만들어 mergeGeometries로 합치던 것)과 같은 꼭짓점을 내는지 확인합니다.

const TAGS = { building: 3, pick: 7 }
const RED = colorBytes(0xff0000)

function near(actual: ArrayLike<number>, expected: ArrayLike<number>, digits = 5) {
  expect(actual.length).toBe(expected.length)
  for (let i = 0; i < actual.length; i++) expect(actual[i], `index ${i}`).toBeCloseTo(expected[i], digits)
}

// 예전 StreetSceneLayer.boxGeometry와 같은 계산
function legacyBox(width: number, height: number, depth: number, x: number, y: number, z: number, rotation: number, tile: BoxUvTile) {
  const geometry = UNIT_BOX.clone()
  geometry.scale(width, height, depth)
  if (tile) {
    const [tileWidth, tileHeight] = tile
    const uv = geometry.getAttribute('uv'), normal = geometry.getAttribute('normal')
    for (let i = 0; i < uv.count; i++) {
      const side = Math.abs(normal.getX(i)) > 0.5
      const top = Math.abs(normal.getY(i)) > 0.5
      uv.setXY(i, uv.getX(i) * (side ? depth : width) / tileWidth, uv.getY(i) * (top ? depth : height) / tileHeight + (top ? 0 : (y - height / 2) / tileHeight))
    }
  }
  geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation), new THREE.Vector3(1, 1, 1)))
  return geometry
}

// 예전 StreetSceneLayer.beam과 같은 계산
function legacyBeam(from: [number, number, number], to: [number, number, number], thickness: number) {
  const start = new THREE.Vector3(...from), end = new THREE.Vector3(...to)
  const vector = end.clone().sub(start)
  const geometry = UNIT_BEAM.clone()
  geometry.scale(thickness, vector.length(), thickness)
  geometry.applyMatrix4(new THREE.Matrix4().compose(start.add(end).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.normalize()), new THREE.Vector3(1, 1, 1)))
  return geometry
}

describe('slot buffer', () => {
  it('appends boxes with the same vertices, normals and UVs as the old box geometry', () => {
    const cases: [number, number, number, number, number, number, number, BoxUvTile][] = [
      [2.5, 1.2, 0.3, 10, 4, -7, 0, null],
      [0.8, 3.1, 0.9, -3.2, 1.5, 2.2, 0.7, [2.4, 1.2]],
      [4, 2.6, 4, 0, 1.3, 0, -2.1, [1.44, 1.44]],
      [1, 1, 1, 5, 5, 5, Math.PI / 2, [1.2, 1.2]],
    ]
    for (const [w, h, d, x, y, z, rotation, tile] of cases) {
      const buffer = new SlotBuffer({ color: true, buildingIndex: true, pickIndex: true })
      buffer.appendBox(w, h, d, x, y, z, rotation, tile, y, RED, TAGS)
      const geometry = buffer.toGeometry()!
      const legacy = legacyBox(w, h, d, x, y, z, rotation, tile)
      near(geometry.getAttribute('position').array, legacy.getAttribute('position').array)
      near(geometry.getAttribute('normal').array, legacy.getAttribute('normal').array)
      near(geometry.getAttribute('uv').array, legacy.getAttribute('uv').array)
      expect(geometry.getAttribute('position').count).toBe(30)
    }
  })

  it('lifts box positions (terrain building base) without changing the UV reference height', () => {
    // 예전: y=1.5로 만든 상자를 건물 바닥 높이 4만큼 translate. 지금: position은 y+4, UV 기준은 원래 y로 계산.
    const legacy = legacyBox(2, 3, 1, 0, 1.5, 0, 0, [2.4, 1.2])
    legacy.translate(0, 4, 0)
    const buffer = new SlotBuffer({ color: true, buildingIndex: false, pickIndex: false })
    buffer.appendBox(2, 3, 1, 0, 1.5 + 4, 0, 0, [2.4, 1.2], 1.5, RED, TAGS)
    const lifted = buffer.toGeometry()!
    near(lifted.getAttribute('position').array, legacy.getAttribute('position').array)
    near(lifted.getAttribute('uv').array, legacy.getAttribute('uv').array)
  })

  it('appends beams like the old beam geometry and skips too-short ones', () => {
    const buffer = new SlotBuffer({ color: true, buildingIndex: false, pickIndex: false })
    expect(buffer.appendBeam([0, 0, 0], [0, 0.01, 0], 0.1, RED, TAGS)).toBe(false)
    expect(buffer.count).toBe(0)
    const from: [number, number, number] = [1, 2, 3], to: [number, number, number] = [4, 5.5, -2]
    expect(buffer.appendBeam(from, to, 0.08, RED, TAGS)).toBe(true)
    const geometry = buffer.toGeometry()!
    const legacy = legacyBeam(from, to, 0.08)
    near(geometry.getAttribute('position').array, legacy.getAttribute('position').array)
    near(geometry.getAttribute('normal').array, legacy.getAttribute('normal').array)
    near(geometry.getAttribute('uv').array, legacy.getAttribute('uv').array)
  })

  it('computes flat face normals for triangles like computeVertexNormals', () => {
    const positions = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0]
    const uvs = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]
    const buffer = new SlotBuffer({ color: true, buildingIndex: false, pickIndex: false })
    buffer.appendTriangles(positions, null, uvs, RED, TAGS)
    const legacy = new THREE.BufferGeometry()
    legacy.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    legacy.computeVertexNormals()
    near(buffer.toGeometry()!.getAttribute('normal').array, legacy.getAttribute('normal').array)
  })

  it('expands indexed geometry and fills colour and tags, copying attributes that already exist', () => {
    const indexed = new THREE.BoxGeometry(1, 2, 3)
    const buffer = new SlotBuffer({ color: true, buildingIndex: true, pickIndex: true })
    buffer.appendGeometry(indexed, RED, TAGS)
    const geometry = buffer.toGeometry()!
    const expanded = indexed.toNonIndexed()
    near(geometry.getAttribute('position').array, expanded.getAttribute('position').array)
    near(geometry.getAttribute('uv').array, expanded.getAttribute('uv').array)
    const color = geometry.getAttribute('color') as THREE.BufferAttribute
    expect(color.normalized).toBe(true)
    expect(Array.from(color.array.slice(0, 3))).toEqual(RED)
    expect(new Set(geometry.getAttribute('buildingIndex').array)).toEqual(new Set([3]))
    expect(new Set(geometry.getAttribute('pickIndex').array)).toEqual(new Set([7]))

    // 합친 메시를 다시 합칠 때: 이미 있는 색·번호를 그대로 복사하고 새 값으로 덮지 않습니다.
    const again = new SlotBuffer({ color: true, buildingIndex: true, pickIndex: true })
    again.appendGeometry(geometry, colorBytes(0x00ff00), { building: 9, pick: 9 })
    const copied = again.toGeometry()!
    expect(Array.from((copied.getAttribute('color') as THREE.BufferAttribute).array.slice(0, 3))).toEqual(RED)
    expect(new Set(copied.getAttribute('buildingIndex').array)).toEqual(new Set([3]))
    expect(new Set(copied.getAttribute('pickIndex').array)).toEqual(new Set([7]))
  })

  it('appends an indexed geometry in ranges exactly like in one go', () => {
    const indexed = new THREE.SphereGeometry(1, 12, 8)
    const whole = new SlotBuffer({ color: true, buildingIndex: true, pickIndex: false })
    whole.appendGeometry(indexed, RED, TAGS)
    const ranged = new SlotBuffer({ color: true, buildingIndex: true, pickIndex: false })
    const count = indexed.getIndex()!.count
    for (let from = 0; from < count; from += 100) ranged.appendGeometry(indexed, RED, TAGS, from, from + 100)
    const a = whole.toGeometry()!, b = ranged.toGeometry()!
    expect(b.getAttribute('position').count).toBe(count)
    near(b.getAttribute('position').array, a.getAttribute('position').array, 7)
    near(b.getAttribute('uv').array, a.getAttribute('uv').array, 7)
    expect(Array.from((b.getAttribute('color') as THREE.BufferAttribute).array)).toEqual(Array.from((a.getAttribute('color') as THREE.BufferAttribute).array))
  })

  it('omits attributes the slot does not use and resets after producing a geometry', () => {
    const buffer = new SlotBuffer({ color: false, buildingIndex: false, pickIndex: false })
    expect(buffer.toGeometry()).toBeNull()
    for (let i = 0; i < 100; i++) buffer.appendBox(1, 1, 1, i, 0, 0, 0, null, 0, RED, TAGS)
    expect(buffer.count).toBe(3000)
    const geometry = buffer.toGeometry()!
    expect(geometry.getAttribute('position').count).toBe(3000)
    expect(geometry.getAttribute('color')).toBeUndefined()
    expect(geometry.getAttribute('buildingIndex')).toBeUndefined()
    expect(geometry.getAttribute('pickIndex')).toBeUndefined()
    expect(buffer.count).toBe(0)
    expect(buffer.toGeometry()).toBeNull()
  })

  it('converts colours to linear bytes like THREE.Color did', () => {
    const linear = new THREE.Color(0x8d5142)
    expect(colorBytes(0x8d5142)).toEqual([Math.round(linear.r * 255), Math.round(linear.g * 255), Math.round(linear.b * 255)])
    expect(colorBytes(0xffffff)).toEqual([255, 255, 255])
  })
})

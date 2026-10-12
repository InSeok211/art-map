import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { buildingFoundationFaces, buildingTerrainBase } from './buildingFoundation'
import { TERRAIN_GROUND_LIFT } from '../groundGeometry'

const outline: [number, number][] = [[0, 0], [12, 0], [12, 8], [0, 8]]
const slope = { height: (x: number, z: number) => 100 + x * 0.25 + z * 0.1 }

describe('terrain building foundations', () => {
  it('keeps the floor above the uphill ground and connects the downhill edge', () => {
    const base = buildingTerrainBase(outline, slope)
    expect(base).toBeCloseTo(slope.height(12, 8) + TERRAIN_GROUND_LIFT + 0.02, 4)
    const faces = buildingFoundationFaces(outline, base, slope)
    expect(faces.length).toBeGreaterThan(1)
    for (const face of faces.slice(0, -1)) {
      const positions = face.getAttribute('position')
      for (let vertex = 0; vertex < positions.count; vertex++) {
        const y = positions.getY(vertex)
        if (y === 0) expect(y + base).toBeGreaterThan(slope.height(positions.getX(vertex), positions.getZ(vertex)) + TERRAIN_GROUND_LIFT)
        else expect(y + base).toBeLessThan(slope.height(positions.getX(vertex), positions.getZ(vertex)) + TERRAIN_GROUND_LIFT)
      }
    }
    faces.forEach((face) => face.dispose())
  })

  it('samples the footprint interior instead of using only corners', () => {
    const hill = { height: (x: number, z: number) => 100 + Math.max(0, 4 - Math.hypot(x - 6, z - 4)) }
    expect(buildingTerrainBase(outline, hill)).toBeGreaterThan(103 + TERRAIN_GROUND_LIFT)
  })

  it('merges the walls and floor into the single foundation used by GLB models', () => {
    const faces = buildingFoundationFaces(outline, buildingTerrainBase(outline, slope), slope)
    const merged = mergeGeometries(faces)
    expect(merged).not.toBeNull()
    expect(merged!.getAttribute('position').count).toBe(faces.reduce((sum, face) => sum + face.getAttribute('position').count, 0))
    merged!.dispose()
    faces.forEach((face) => face.dispose())
  })

  it('keeps foundation faces outward for concave, reversed, and closed outlines', () => {
    const concave: [number, number][] = [[0, 0], [12, 0], [12, 4], [4, 4], [4, 8], [0, 8]]
    for (const ring of [concave, [...concave].reverse(), [...concave, concave[0]]]) {
      const faces = buildingFoundationFaces(ring, buildingTerrainBase(ring, slope), slope)
      for (const face of faces.slice(0, -1)) {
        const positions = face.getAttribute('position'), normals = face.getAttribute('normal')
        const a = new THREE.Vector3().fromBufferAttribute(positions, 0)
        const b = new THREE.Vector3().fromBufferAttribute(positions, 1)
        const c = new THREE.Vector3().fromBufferAttribute(positions, 2)
        const normal = b.sub(a).cross(c.sub(a)).normalize()
        expect(normal.dot(new THREE.Vector3().fromBufferAttribute(normals, 0))).toBeGreaterThan(0.99)
      }
      faces.forEach((face) => face.dispose())
    }
  })

  it('adds no foundation in flat mode or on level terrain', () => {
    expect(buildingTerrainBase(outline)).toBe(0)
    expect(buildingFoundationFaces(outline, 0)).toEqual([])
    const level = { height: () => 100 }
    expect(buildingFoundationFaces(outline, buildingTerrainBase(outline, level), level)).toEqual([])
  })
})

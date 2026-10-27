import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import roadGround from '../generated/road-ground.json'
import buildingOutlines from '../generated/building-outlines.json'
import { ribbonPolygons } from './roadGround'
import type { RoadGround } from './roadGround'
import { decodeRoadGroundMesh, encodeRoadGroundMesh, ROAD_GROUND_GROUPS, roadGroundMeshGeometry } from './roadGroundMesh'
import { flatPolygonGeometry, isDrawablePolygon } from './groundGeometry'
import { buildingOutlinesInputsHash, roadGroundInputsHash } from '../../scripts/road-ground-inputs.mjs'
import { computeBuildingOutlines } from './streetSceneData'

describe('precomputed road ground', () => {
  it('is up to date with the map data and geometry code (run `npm run build:road-ground` if this fails)', () => {
    expect(buildingOutlines.inputsHash).toBe(buildingOutlinesInputsHash())
    expect(roadGround.inputsHash).toBe(roadGroundInputsHash())
  })

  it('stores exactly the outlines the map would otherwise trim on every load', () => {
    expect(JSON.parse(JSON.stringify(computeBuildingOutlines()))).toEqual(buildingOutlines.outlines)
  })

  it('contains every drawn surface', () => {
    for (const key of ['roads', 'outer', 'footways', 'kerbStone', 'kerbLine', 'meeting'] as const) {
      expect(roadGround[key].length, key).toBeGreaterThan(0)
    }
  })

  it('ships the same surfaces pre-triangulated in road-ground-mesh.bin (run `npm run build:road-ground` if this fails)', () => {
    const bytes = readFileSync('src/generated/road-ground-mesh.bin')
    const mesh = decodeRoadGroundMesh(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
    expect(mesh.inputsHash).toBe(roadGround.inputsHash)
    const ground = roadGround as unknown as RoadGround
    for (const group of ROAD_GROUND_GROUPS) {
      expect(mesh.groups[group].length, group).toBe(ground[group].filter(isDrawablePolygon).length)
    }
    // 저장된 삼각형은 지도가 예전에 실행 중에 만들던 도형(flatPolygonGeometry)과 꼭짓점·인덱스가 같습니다.
    const polygon = ground.roads[0]
    const expected = flatPolygonGeometry(polygon, 0.07, 20)
    const actual = roadGroundMeshGeometry(mesh, mesh.groups.roads[0], 0.07)
    expect(Array.from(actual.getAttribute('position').array)).toEqual(Array.from(expected.getAttribute('position').array).map((value) => Math.fround(value)))
    expect(Array.from(actual.getIndex()!.array)).toEqual(Array.from(expected.getIndex()!.array))
    expect(Array.from(actual.getAttribute('uv').array)).toEqual(Array.from(expected.getAttribute('uv').array).map((value) => Math.fround(value)))
  })

  it('round-trips a small mesh through the binary format', () => {
    const square: RoadGround['roads'] = [[[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]]
    const empty: RoadGround['roads'] = []
    const bytes = encodeRoadGroundMesh({ roads: square, outer: empty, footways: empty, kerbStone: empty, kerbLine: empty, meeting: empty }, 'abc')
    const mesh = decodeRoadGroundMesh(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
    expect(mesh.inputsHash).toBe('abc')
    expect(mesh.groups.roads).toHaveLength(1)
    expect(mesh.groups.outer).toHaveLength(0)
    expect(mesh.groups.roads[0].vertexCount).toBe(4)
    expect(mesh.groups.roads[0].indexCount).toBe(6)
  })

  it('offsets a ribbon to the side of its centreline', () => {
    const [ribbon] = ribbonPolygons([[0, 0], [10, 0]], 1, 3)
    const zs = ribbon[0].map(([, z]) => z)
    expect(Math.min(...zs)).toBeCloseTo(2.5)
    expect(Math.max(...zs)).toBeCloseTo(3.5)
  })
})

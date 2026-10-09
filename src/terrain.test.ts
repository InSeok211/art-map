import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import terrainData from './generated/terrain.json'
import { TerrainSampler } from './terrain'
import type { TerrainData } from './terrain'
import { drapeOnTerrain } from './StreetSceneLayer'
import { streetMeters } from './streetSceneData'
import { ARTIST_WORKSHOP_PLACE } from './artistWorkshop'

const encode = (values: number[]) => {
  const bytes = new Uint8Array(new Uint16Array(values.map((value) => Math.round(value * 10))).buffer)
  return Buffer.from(bytes).toString('base64')
}

describe('terrain sampler', () => {
  // 2x2 격자(10m): 서쪽 0m, 동쪽 20m
  const sampler = new TerrainSampler({ cell: 10, minX: 0, minZ: 0, cols: 2, rows: 2, heights: encode([0, 20, 0, 20]) })

  it('interpolates between grid points and clamps outside', () => {
    expect(sampler.height(5, 5)).toBeCloseTo(10)
    expect(sampler.height(-50, 3)).toBeCloseTo(0)
    expect(sampler.height(80, 3)).toBeCloseTo(20, 0)
  })

  it('stands a building at its lowest corner', () => {
    expect(sampler.lowest([[2, 2], [8, 2], [8, 8], [2, 8]])).toBeCloseTo(4)
  })

  it('reads the Gamcheon hillside from the baked table', () => {
    const gamcheon = new TerrainSampler(terrainData as unknown as TerrainData)
    const [x, z] = streetMeters([ARTIST_WORKSHOP_PLACE.longitude, ARTIST_WORKSHOP_PLACE.latitude])
    // 감천문화마을은 해발 수십~백여 m의 비탈입니다.
    expect(gamcheon.height(x, z)).toBeGreaterThan(20)
    expect(gamcheon.height(x, z)).toBeLessThan(200)
  })
})

describe('drapeOnTerrain', () => {
  it('splits long ground triangles and lifts every vertex onto the slope without cracks', () => {
    const slope = { height: (x: number) => x * 0.5 }
    const ground = new THREE.PlaneGeometry(40, 10, 1, 1)
    ground.rotateX(-Math.PI / 2)
    ground.translate(20, 0, 0)
    const draped = drapeOnTerrain(ground, slope, 0, 6)
    const position = draped.getAttribute('position')
    for (let index = 0; index < position.count; index++) expect(position.getY(index)).toBeCloseTo(position.getX(index) * 0.5)
    const triangles = draped.index!.count / 3
    expect(triangles).toBeGreaterThan(10)
    // 이웃 삼각형이 변의 가운데 점을 함께 쓰므로 꼭짓점 수가 삼각형마다 따로 만든 것보다 훨씬 적습니다.
    expect(position.count).toBeLessThan(triangles * 3 / 2)
  })
})

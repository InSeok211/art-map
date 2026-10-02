import { describe, expect, it } from 'vitest'
import { GAMCHEON2_BOUNDS, GAMCHEON_MAP_BOUNDS, gamcheonBoundaryFeature, gamcheonOutsideFeature, isBuildingInsideGamcheon2, isInsideGamcheon2, isInsideGamcheonMap } from './gamcheonBoundary'

describe('Gamcheon 2-dong boundary', () => {
  it('keeps the source polygon closed and within its recorded bounds', () => {
    const ring = gamcheonBoundaryFeature.geometry.coordinates[0]
    expect(ring[0]).toEqual(ring.at(-1))
    expect(GAMCHEON2_BOUNDS).toEqual([[129.0028058, 35.0892957], [129.0143734, 35.0997347]])
    expect(GAMCHEON_MAP_BOUNDS[0][0]).toBeCloseTo(128.9998058, 7)
    expect(GAMCHEON_MAP_BOUNDS[0][1]).toBeCloseTo(35.0867957, 7)
    expect(GAMCHEON_MAP_BOUNDS[1][0]).toBeCloseTo(129.0173734, 7)
    expect(GAMCHEON_MAP_BOUNDS[1][1]).toBeCloseTo(35.1022347, 7)
    const [[west, south], [east, north]] = GAMCHEON_MAP_BOUNDS
    expect(gamcheonOutsideFeature.geometry.coordinates[1]).toEqual([
      [west, south], [west, north], [east, north], [east, south], [west, south],
    ])
  })

  it('accepts places inside and rejects nearby places outside the administrative area', () => {
    expect(isInsideGamcheon2(129.0103, 35.0975)).toBe(true)
    expect(isInsideGamcheon2(129.0105, 35.0978)).toBe(true)
    expect(isInsideGamcheon2(129.01, 35.08)).toBe(false)
  })

  it('includes surrounding streets within the rectangular map area', () => {
    expect(isInsideGamcheon2(129.011, 35.098)).toBe(false)
    expect(isInsideGamcheonMap(129.011, 35.098)).toBe(true)
    expect(isInsideGamcheonMap(129.01, 35.08)).toBe(false)
  })

  it('classifies building footprints by their centroid, including a closed ring', () => {
    expect(isBuildingInsideGamcheon2([
      [129.0102, 35.0974], [129.0104, 35.0974],
      [129.0104, 35.0976], [129.0102, 35.0976], [129.0102, 35.0974],
    ])).toBe(true)
    expect(isBuildingInsideGamcheon2([
      [129.0109, 35.0979], [129.0111, 35.0979],
      [129.0111, 35.0981], [129.0109, 35.0981],
    ])).toBe(false)
  })
})

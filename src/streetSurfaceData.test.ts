import { describe, expect, it } from 'vitest'
import { clipPolygonToBounds, clipSegmentToBounds, getStreetSceneBounds, STREET_SURFACE_WAYS } from './streetSurfaceData'
import { getPhotographedStreetBuildings, streetMeters } from './streetSceneData'
import { GAMCHEON_MAP_BOUNDS } from './gamcheonBoundary'

describe('modeled ground and roads', () => {
  it('covers every building footprint in the expanded scene', () => {
    const bounds = getStreetSceneBounds()
    for (const building of getPhotographedStreetBuildings()) for (const point of building.outline) {
      const [x, z] = streetMeters(point)
      expect(x).toBeGreaterThanOrEqual(bounds.minX)
      expect(x).toBeLessThanOrEqual(bounds.maxX)
      expect(z).toBeGreaterThanOrEqual(bounds.minZ)
      expect(z).toBeLessThanOrEqual(bounds.maxZ)
    }
    for (const point of GAMCHEON_MAP_BOUNDS) {
      const [x, z] = streetMeters(point)
      expect(x).toBeGreaterThanOrEqual(bounds.minX)
      expect(x).toBeLessThanOrEqual(bounds.maxX)
      expect(z).toBeGreaterThanOrEqual(bounds.minZ)
      expect(z).toBeLessThanOrEqual(bounds.maxZ)
    }
  }, 30000)

  it('keeps OSM roads and green areas clipped to the ground slab', () => {
    expect(STREET_SURFACE_WAYS.roads.length).toBeGreaterThan(500)
    expect(STREET_SURFACE_WAYS.green.length).toBeGreaterThan(10)
    const bounds = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 }
    expect(clipSegmentToBounds([-5, 5], [15, 5], bounds)).toEqual([[0, 5], [10, 5]])
    expect(clipSegmentToBounds([-5, -5], [-1, -1], bounds)).toBeNull()
    expect(clipPolygonToBounds([[-5, 2], [5, 2], [5, 8], [-5, 8]], bounds)).toEqual([
      [0, 2], [5, 2], [5, 8], [0, 8],
    ])
  })
})

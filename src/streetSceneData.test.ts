import { describe, expect, it } from 'vitest'
import * as polygonClipping from 'polygon-clipping'
import mapSurfaces from './street-surfaces.json'
import buildingFootprints from './gamcheon-buildings.json'
import { PHOTOGRAPHED_ROAD_WIDTH, roadOutlines, roadWidth } from './roadCorridors'
import { PHOTOGRAPHED_ROAD_POINTS } from './streetRoadGeometry'
import { ARTIST_WORKSHOP_ANNEX_ID, ARTIST_WORKSHOP_FOOTPRINT_ID, clearOfCarriageways, clearRoadOfKeptBuildings, getPhotographedStreetBuildings, KEEP_MAPPED_OUTLINE, MEETING_CIRCLE_CENTER, MEETING_CIRCLE_RADIUS, nearestStreet, PHOTOGRAPHED_STREET, sharedBuildingEdges, streetMeters } from './streetSceneData'
import { isInsideGamcheonMap } from './gamcheonBoundary'

describe('photographed street scene', () => {
  it('uses the surveyed road bend from the cafe toward the workshop', () => {
    expect(PHOTOGRAPHED_STREET[0][1]).toBeLessThan(PHOTOGRAPHED_STREET.at(-1)![1])
    expect(nearestStreet([129.00884, 35.0943657]).distanceMeters).toBeLessThan(0.1)
    expect(nearestStreet([129.0091904, 35.0955217]).progress).toBe(1)
  })

  it('covers the whole map while preserving surveyed buildings', () => {
    const buildings = getPhotographedStreetBuildings()
    expect(buildings.length).toBeGreaterThan(2000)
    expect(buildings.length).toBeLessThan(2170)
    expect(buildings.some((building) => nearestStreet(building.outline[0]).distanceMeters > 500)).toBe(true)
    expect(buildings.filter((building) => building.detail === 'context').length).toBeGreaterThan(65)
    expect(buildings.filter((building) => building.detail === 'context').every((building) => !building.storefront)).toBe(true)
    // A photographed single-storey house is lower than the generic fallback.
    expect(buildings.every((building) => building.outline.length >= 3 && building.heightMeters >= 3)).toBe(true)
    expect(buildings.every((building) => isInsideGamcheonMap(
      building.outline.reduce((sum, p) => sum + p[0], 0) / building.outline.length,
      building.outline.reduce((sum, p) => sum + p[1], 0) / building.outline.length,
    ))).toBe(true)
    expect(new Set(buildings.map((building) => building.id)).size).toBe(buildings.length)
    expect(buildings.some((building) => building.storefront)).toBe(true)
    expect(buildings.some((building) => building.detail === 'context' && building.roofStyle === 'gable')).toBe(true)
    expect(buildings.find((building) => building.id === 1469906540)).toMatchObject({ wallColor: 0x83ad46, storefront: true })
    expect(Object.fromEntries(buildings.filter((building) => building.concept)
      .map((building) => [building.concept, building.id]))).toEqual({
      soup: 1468551460,
      chinese: 1468590636,
      mart: 1468551459,
      handmade: 1468590634,
      fofos: 1468551461,
    })
    expect(buildings.filter((building) => building.observed).length).toBe(19)
    expect([1469906535, 1469906543, 1469906545, 1469906517, 1469906549, 1468590691]
      .every((id) => buildings.some((building) => building.id === id && building.observed))).toBe(true)
    expect(buildings.filter((building) => building.observed)
      .every((building) => building.detail === 'featured' && building.observed!.frame >= 1)).toBe(true)
    expect(buildings.filter((building) => building.roadview).map((building) => building.id).sort())
      .toEqual([
        1467907430, 1467907462, 1467907463, 1467907509, 1467910232, 1467910240, 1467910242, 1468110784, 1468110796,
        1468277196, 1468277197, 1468277207, 1468277208, 1468277209, 1468277210, 1468277211, 1468277215, 1468352618, 1468352626, 1468352652,
        1468352662, 1468352669, 1468352670, 1468352676, 1468352683, 1468352684, 1468352689, 1468352690, 1468352691, 1468352713, 1468485967, 1468485969,
        1468485974, 1468485978, 1468485981, 1468485984, 1468485985, 1468485990, 1468551348, 1468551453, 1468551454,
        1468551455, 1468551456, 1468551457, 1468551458, 1468590570, 1468590605, 1468590612, 1468590613, 1468590614, 1468590615,
        1468590619, 1468590633, 1468590644, 14685906441, 1468590688, 1469906501, 1469906524, 1469906525, 1469906528,
        1469906529, 1469906598])
    const workshop = buildings.find((building) => building.id === ARTIST_WORKSHOP_FOOTPRINT_ID)!
    expect(workshop.roadview?.roofRailing).toBe(true)
    expect(buildings.find((building) => building.id === 1468551456))
      .toMatchObject({ heightMeters: 8, wallColor: 0xa45136, roadview: { captured: '2025-11', surface: 'brick', ground: 'window', baseColor: 0xbbb9af } })
    expect(buildings.find((building) => building.id === 1468551458))
      .toMatchObject({ wallColor: 0xe8e7df, roadview: { surface: 'plaster', awning: 0x56b4ad, awningProfile: 'curved', groundWindowWidth: 3.3, doorColor: 0xc6a8b9 } })
    expect(buildings.find((building) => building.id === 1468590619))
      .toMatchObject({ wallColor: 0x8e5141, roadview: { surface: 'brick', ground: 'shutter-glass', lowerWallColor: 0xdedfd8 } })
    expect(buildings.find((building) => building.id === 1468590614))
      .toMatchObject({ wallColor: 0xc8a438, roadview: { captured: '2025-11', surface: 'plaster', baseColor: 0x6289a4, stoneBaseHeight: 0.9, balcony: true } })
    expect(buildings.find((building) => building.id === 1468590615))
      .toMatchObject({ wallColor: 0xe1e6d8, roadview: { captured: '2025-11', surface: 'plaster', stoneBaseHeight: 1.15 } })
    expect(buildings.filter((building) => building.roofEvidence).length).toBeGreaterThan(1300)
    const aerialPainted = buildings.filter((building) => building.roofEvidence && building.roofEvidence.confidence !== 'low')
    expect(aerialPainted.length).toBeGreaterThan(1200)
    expect(new Set(aerialPainted.map((building) => building.roofColor)).size).toBeLessThan(25)
    expect(buildings.find((building) => building.id === 1468551458)?.roofEvidence)
      .toMatchObject({ source: 'skyview', kind: 'red', confidence: 'high' })
    expect(buildings.find((building) => building.id === 1468590619)?.roofEvidence)
      .toMatchObject({ source: 'skyview', kind: 'green', confidence: 'high' })
    expect(buildings.every((building) => (building.sharedEdges ?? [])
      .every((edge) => edge >= 0 && edge < building.outline.length))).toBe(true)
    // Street-level evidence is unavailable for the surrounding blocks. Keep
    // those facades neutral instead of claiming an address-specific palette.
    // 공방 주변의 추정 외관(inferred)은 별도 테스트에서 근거 건물을 검사합니다.
    const unverified = buildings.filter((building) => !building.observed && !building.roadview && !building.inferred
      && !building.concept && building.id !== 1469906540)
    expect(unverified.every((building) => !Object.hasOwn(building, 'contextDesign'))).toBe(true)
    expect(unverified.every((building) => !building.storefront && !building.brickFacade)).toBe(true)
    expect(unverified.every((building) => {
      const red = building.wallColor >> 16 & 0xff
      const green = building.wallColor >> 8 & 0xff
      const blue = building.wallColor & 0xff
      return Math.max(red, green, blue) - Math.min(red, green, blue) <= 24
    })).toBe(true)
  })

  it('splits the workshop out of the long OSM strip at the roadview-measured size', () => {
    const buildings = getPhotographedStreetBuildings()
    const workshop = buildings.find((building) => building.id === ARTIST_WORKSHOP_FOOTPRINT_ID)!
    const annex = buildings.find((building) => building.id === ARTIST_WORKSHOP_ANNEX_ID)!
    const meters = workshop.outline.map(streetMeters)
    const side = (a: number, b: number) => Math.hypot(meters[b][0] - meters[a][0], meters[b][1] - meters[a][1])
    // 골목 쪽 면 약 4m(통창 세 칸 + 벽돌), 갈림길 쪽 면 약 3.7m(통창 한 칸 + 양문)
    expect(meters).toHaveLength(4)
    expect(side(0, 1)).toBeCloseTo(4, 3)
    expect(side(0, 3)).toBeCloseTo(3.7, 3)
    expect(annex.outline).toHaveLength(4)
    // 카카오 장소 좌표(꿈꾸는작업실, 대략적인 표시점)는 보정한 윤곽에서 1m 안에 있습니다.
    const place = streetMeters([129.009215, 35.095428])
    expect(Math.min(...meters.map((point, index) => {
      const next = meters[(index + 1) % meters.length]
      const length = Math.hypot(next[0] - point[0], next[1] - point[1])
      const along = Math.max(0, Math.min(length, ((place[0] - point[0]) * (next[0] - point[0]) + (place[1] - point[1]) * (next[1] - point[1])) / length))
      return Math.hypot(place[0] - point[0] - (next[0] - point[0]) * along / length, place[1] - point[1] - (next[1] - point[1]) * along / length)
    }))).toBeLessThan(1)
    // 이웃 윤곽과 겹치지 않습니다.
    const ring = (outline: [number, number][]) => [[...outline.map(streetMeters), streetMeters(outline[0])]] as polygonClipping.Polygon
    const overlap = buildings.filter((building) => building.id !== workshop.id).reduce((area, building) =>
      area + polygonClipping.intersection(ring(workshop.outline), ring(building.outline))
        .reduce((sum, polygon) => sum + Math.abs(polygon[0].reduce((total, point, index) => {
          const next = polygon[0][(index + 1) % polygon[0].length]
          return total + point[0] * next[1] - next[0] * point[1]
        }, 0) / 2), 0), 0)
    expect(overlap).toBeLessThan(0.05)
  })

  it('does not copy nearby facade colours onto buildings without individual evidence', () => {
    const buildings = getPhotographedStreetBuildings()
    expect(buildings.some((building) => building.roadview)).toBe(true)
    expect(buildings.filter((building) => building.inferred)).toHaveLength(0)
  })
  it('keeps every building off the drawn carriageway even where OSM footprints overlap it', () => {
    // 거리 장면이 실제로 그리는 차도(분홍 주택·공방 옆은 중심선을 보정한 도로)와 비교합니다.
    const runs = mapSurfaces.roads.map((way) => ({
      points: clearRoadOfKeptBuildings((way.points as [number, number][]).map(streetMeters), roadWidth(way)),
      width: roadWidth(way), type: way.type, gaps: [],
    }))
    runs.push({ points: PHOTOGRAPHED_ROAD_POINTS, width: PHOTOGRAPHED_ROAD_WIDTH, type: 'photographed', gaps: [] })
    const roads = roadOutlines(runs)
    const box = (ring: [number, number][]) => [
      Math.min(...ring.map(([x]) => x)), Math.max(...ring.map(([x]) => x)),
      Math.min(...ring.map(([, z]) => z)), Math.max(...ring.map(([, z]) => z)),
    ]
    const roadBoxes = roads.map((polygon) => box(polygon[0] as [number, number][]))
    const area = (rings: polygonClipping.MultiPolygon) => rings.reduce((sum, polygon) => sum + Math.abs(polygon[0]
      .reduce((total, point, index) => {
        const next = polygon[0][(index + 1) % polygon[0].length]
        return total + point[0] * next[1] - next[0] * point[1]
      }, 0) / 2), 0)
    const overlapWithRoads = (outline: [number, number][]) => {
      const meters = outline.map(streetMeters)
      const [minX, maxX, minZ, maxZ] = box(meters)
      const ring = [...meters, meters[0]]
      return roads.reduce((sum, polygon, index) => {
        const [a, b, c, d] = roadBoxes[index]
        return a < maxX && b > minX && c < maxZ && d > minZ ? sum + area(polygonClipping.intersection([ring], polygon)) : sum
      }, 0)
    }
    // 1469650931은 OSM 윤곽의 약 1/7이 골목 차도 위에 그려져 있습니다.
    const protruding = (buildingFootprints.features.find((feature) => feature.properties.id === 1469650931)!
      .geometry.coordinates[0] as [number, number][]).slice(0, -1)
    expect(overlapWithRoads(protruding)).toBeGreaterThan(4)
    expect(overlapWithRoads(clearOfCarriageways(protruding)!)).toBeLessThan(0.25)
    // 차도와 닿지 않는 건물은 원래 윤곽을 그대로 씁니다.
    const untouched = (buildingFootprints.features.find((feature) => feature.properties.id === 1468590642)!
      .geometry.coordinates[0] as [number, number][]).slice(0, -1)
    expect(clearOfCarriageways(untouched)).toBe(untouched)
    // 곧은 벽으로 정리하며 남는 차이는 폭 4cm 이하의 가는 띠뿐입니다.
    const buildings = getPhotographedStreetBuildings()
    expect(Math.max(...buildings.map((building) => overlapWithRoads(building.outline)))).toBeLessThan(0.35)
    // 분홍 주택과 공방은 윤곽 대신 도로를 고쳐, 겹침이 거의 없습니다.
    for (const id of KEEP_MAPPED_OUTLINE) {
      expect(overlapWithRoads(buildings.find((building) => building.id === id)!.outline)).toBeLessThan(0.05)
    }
  }, 30000)

  it('keeps the round paving at the junction clear of every building', () => {
    const [x, z] = streetMeters(MEETING_CIRCLE_CENTER)
    const nearest = Math.min(...getPhotographedStreetBuildings().map((building) => {
      const meters = building.outline.map(streetMeters)
      return Math.min(...meters.map((start, index) => {
        const end = meters[(index + 1) % meters.length]
        const dx = end[0] - start[0], dz = end[1] - start[1]
        const t = Math.max(0, Math.min(1, ((x - start[0]) * dx + (z - start[1]) * dz) / (dx * dx + dz * dz || 1)))
        return Math.hypot(x - start[0] - dx * t, z - start[1] - dz * t)
      }))
    }))
    expect(nearest).toBeGreaterThan(MEETING_CIRCLE_RADIUS)
  })

  it('keeps party walls free of facade openings but leaves corner contacts exposed', () => {
    const house: [number, number][] = [[0, 0], [5, 0], [5, 8], [0, 8]]
    const adjacent: [number, number][] = [[5.3, 0], [10, 0], [10, 8], [5.3, 8]]
    const corner: [number, number][] = [[5.3, 8.3], [8, 8.3], [8, 10], [5.3, 10]]
    expect(sharedBuildingEdges(house, [adjacent])).toEqual([1])
    expect(sharedBuildingEdges(house, [corner])).toEqual([])
  })
})

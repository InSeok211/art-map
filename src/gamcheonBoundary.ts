import boundary from './gamcheon2-boundary.json'

type Position = [number, number]

const ring: Position[] = boundary.geometry.coordinates[0].map(
  ([longitude, latitude]) => [longitude, latitude],
)

const longitudes = ring.map(([longitude]) => longitude)
const latitudes = ring.map(([, latitude]) => latitude)

export const GAMCHEON2_BOUNDS: [Position, Position] = [
  [Math.min(...longitudes), Math.min(...latitudes)],
  [Math.max(...longitudes), Math.max(...latitudes)],
]

// Include a small belt of surrounding streets so the neighborhood reads as a map.
export const GAMCHEON_MAP_BOUNDS: [Position, Position] = [
  [GAMCHEON2_BOUNDS[0][0] - 0.003, GAMCHEON2_BOUNDS[0][1] - 0.0025],
  [GAMCHEON2_BOUNDS[1][0] + 0.003, GAMCHEON2_BOUNDS[1][1] + 0.0025],
]

const [[west, south], [east, north]] = GAMCHEON_MAP_BOUNDS
const mapAreaRing: Position[] = [[west, south], [east, south], [east, north], [west, north], [west, south]]

export const gamcheonMapAreaFeature = {
  type: 'Feature' as const,
  properties: { name: '감천2동 주변 지도' },
  geometry: { type: 'Polygon' as const, coordinates: [mapAreaRing] },
}

export const gamcheonBoundaryFeature = {
  type: 'Feature' as const,
  properties: { name: '감천2동' },
  geometry: { type: 'Polygon' as const, coordinates: [ring] },
}

// The second ring is a rectangular hole where the base map stays visible.
export const gamcheonOutsideFeature = {
  type: 'Feature' as const,
  properties: {},
  geometry: {
    type: 'Polygon' as const,
    coordinates: [
      [[128.5, 34.7], [129.5, 34.7], [129.5, 35.5], [128.5, 35.5], [128.5, 34.7]],
      [...mapAreaRing].reverse(),
    ],
  },
}

export function isInsideGamcheonMap(longitude: number, latitude: number): boolean {
  return Number.isFinite(longitude) && Number.isFinite(latitude)
    && longitude >= west && longitude <= east && latitude >= south && latitude <= north
}

export function isInsideGamcheon2(longitude: number, latitude: number): boolean {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return false
  let inside = false

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x1, y1] = ring[previous]
    const [x2, y2] = ring[index]
    const cross = (longitude - x1) * (y2 - y1) - (latitude - y1) * (x2 - x1)
    if (Math.abs(cross) < 1e-10 && longitude >= Math.min(x1, x2) && longitude <= Math.max(x1, x2)
      && latitude >= Math.min(y1, y2) && latitude <= Math.max(y1, y2)) return true
    if ((y1 > latitude) !== (y2 > latitude)
      && longitude < ((x2 - x1) * (latitude - y1)) / (y2 - y1) + x1) inside = !inside
  }

  return inside
}

// Classify a building by its area centroid so a wall crossing the dong line
// does not cause the whole building to flicker in or out at the border.
export function isBuildingInsideGamcheon2(outline: number[][]): boolean {
  const points = outline.length > 1 && outline[0][0] === outline.at(-1)?.[0]
    && outline[0][1] === outline.at(-1)?.[1] ? outline.slice(0, -1) : outline
  if (points.length < 3) return false
  const [originLongitude, originLatitude] = points[0]
  let twiceArea = 0
  let longitudeSum = 0
  let latitudeSum = 0
  for (let index = 0; index < points.length; index++) {
    const [longitude1, latitude1] = points[index]
    const [longitude2, latitude2] = points[(index + 1) % points.length]
    const x1 = longitude1 - originLongitude
    const y1 = latitude1 - originLatitude
    const x2 = longitude2 - originLongitude
    const y2 = latitude2 - originLatitude
    const cross = x1 * y2 - x2 * y1
    twiceArea += cross
    longitudeSum += (x1 + x2) * cross
    latitudeSum += (y1 + y2) * cross
  }
  if (Math.abs(twiceArea) < 1e-14) return false
  return isInsideGamcheon2(originLongitude + longitudeSum / (3 * twiceArea), originLatitude + latitudeSum / (3 * twiceArea))
}

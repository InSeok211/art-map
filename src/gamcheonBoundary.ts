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

export const GAMCHEON_MAP_PAN_BOUNDS: [Position, Position] = [
  [GAMCHEON_MAP_BOUNDS[0][0] - 0.02, GAMCHEON_MAP_BOUNDS[0][1] - 0.02],
  [GAMCHEON_MAP_BOUNDS[1][0] + 0.02, GAMCHEON_MAP_BOUNDS[1][1] + 0.02],
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

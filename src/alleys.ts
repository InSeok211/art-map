export type LngLat = [number, number]

export interface Alley {
  id: string
  name?: string
  coordinates: LngLat[]
  widthMeters: number
}

export const ALLEY_WIDTH_RANGE = { min: 1, max: 8, default: 3 } as const

const isPosition = (value: unknown): value is LngLat =>
  Array.isArray(value) && value.length === 2 && value.every((part) => Number.isFinite(part))

export function sanitizeAlleys(value: unknown): Alley[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Alley => {
    if (!item || typeof item !== 'object') return false
    const alley = item as Partial<Alley>
    return typeof alley.id === 'string'
      && (alley.name === undefined || typeof alley.name === 'string')
      && Array.isArray(alley.coordinates) && alley.coordinates.length >= 2 && alley.coordinates.every(isPosition)
      && Number.isFinite(alley.widthMeters)
      && Number(alley.widthMeters) >= ALLEY_WIDTH_RANGE.min && Number(alley.widthMeters) <= ALLEY_WIDTH_RANGE.max
  })
}

export function alleysToGeoJSON(alleys: Alley[], selectedId: string | null) {
  return {
    type: 'FeatureCollection' as const,
    features: alleys.map((alley) => ({
      type: 'Feature' as const,
      properties: { id: alley.id, width: alley.widthMeters, selected: alley.id === selectedId },
      geometry: { type: 'LineString' as const, coordinates: alley.coordinates },
    })),
  }
}

export function draftToGeoJSON(points: LngLat[]) {
  return {
    type: 'FeatureCollection' as const,
    features: [
      ...(points.length >= 2 ? [{
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'LineString' as const, coordinates: points },
      }] : []),
      ...points.map((point) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'Point' as const, coordinates: point },
      })),
    ],
  }
}

export function alleyLengthMeters(coordinates: LngLat[]): number {
  let total = 0
  for (let index = 1; index < coordinates.length; index++) {
    const [lng1, lat1] = coordinates[index - 1]
    const [lng2, lat2] = coordinates[index]
    const x = (lng2 - lng1) * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180)
    total += Math.hypot(x, lat2 - lat1) * 111_320
  }
  return total
}

import { pathLengthMeters } from '../map/streetCoordinates'
import { alleyProblem } from './alleyRules'

export type LngLat = [number, number]

export interface Alley {
  id: string
  name?: string
  coordinates: LngLat[]
  widthMeters: number
}

export function sanitizeAlleys(value: unknown): Alley[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Alley => alleyProblem(item) === null)
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

export const alleyLengthMeters = (coordinates: LngLat[]): number => pathLengthMeters(coordinates)

import type { Place } from '../types'
import { isInsideGamcheonMap } from '../map/gamcheonBoundary'

export const MAP_PLACES_KEY = 'gamcheon-map-public-places-v1'

// Reject the whole update rather than silently removing invalid entries.
export function cleanMapPlaces(value: unknown): Place[] | null {
  if (!Array.isArray(value) || value.length > 500) return null
  const ids = new Set<string>()
  const places: Place[] = []
  for (const item of value) {
    const p = item as Partial<Place> | null
    if (!p || typeof p.id !== 'string' || !p.id || p.id.length > 100 || ids.has(p.id)
      || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 80
      || !['shop', 'attraction', 'toilets', 'bus_stop'].includes(p.category ?? '')
      || typeof p.longitude !== 'number' || !Number.isFinite(p.longitude)
      || typeof p.latitude !== 'number' || !Number.isFinite(p.latitude)
      || !isInsideGamcheonMap(p.longitude, p.latitude)
      || (p.address !== undefined && (typeof p.address !== 'string' || p.address.length > 160))
      || (p.description !== undefined && (typeof p.description !== 'string' || p.description.length > 500))) return null
    ids.add(p.id)
    places.push({ id: p.id, name: p.name.trim(), category: p.category!, longitude: p.longitude,
      latitude: p.latitude, address: p.address ?? '', description: p.description ?? '' })
  }
  return places
}

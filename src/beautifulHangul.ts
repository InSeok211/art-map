import type { Place } from './types'
import buildingFootprints from './gamcheon-buildings.json'

// 감내1로175번길 32. Keep the location and orientation tied to the actual OSM
// quadrilateral, rather than manually nudging a rectangular preview model.
export const BEAUTIFUL_HANGUL_FOOTPRINT_ID = 1468551350
type Point = [longitude: number, latitude: number]
const feature = buildingFootprints.features.find((item) => item.properties.id === BEAUTIFUL_HANGUL_FOOTPRINT_ID)
if (!feature || feature.geometry.type !== 'Polygon') throw new Error('Beautiful Hangul OSM footprint is missing')
const ring = feature.geometry.coordinates[0].slice(0, -1) as Point[]
if (ring.length !== 4) throw new Error('Beautiful Hangul OSM footprint is no longer four-sided')
export const BEAUTIFUL_HANGUL_OUTLINE = ring
export const BEAUTIFUL_HANGUL_CENTER: Point = [
  ring.reduce((sum, point) => sum + point[0], 0) / ring.length,
  ring.reduce((sum, point) => sum + point[1], 0) / ring.length,
]
const west = [...ring].sort((a, b) => a[0] - b[0]).slice(0, 2).sort((a, b) => b[1] - a[1])
const metersPerLatitude = 111_320
const metersPerLongitude = metersPerLatitude * Math.cos(BEAUTIFUL_HANGUL_CENTER[1] * Math.PI / 180)
const acrossEast = (west[1][0] - west[0][0]) * metersPerLongitude
const acrossSouth = (west[0][1] - west[1][1]) * metersPerLatitude
// The model's +x runs along the glazing from north to south; +z faces the alley.
export const BEAUTIFUL_HANGUL_ROTATION = Math.atan2(-acrossSouth, acrossEast)

export const BEAUTIFUL_HANGUL_PLACE: Place = {
  id: 'beautiful-hangul-place-32',
  name: '아름다운한글',
  category: 'attraction',
  longitude: BEAUTIFUL_HANGUL_CENTER[0],
  latitude: BEAUTIFUL_HANGUL_CENTER[1],
  address: '부산 사하구 감내1로175번길 32',
  description: '한글 서예와 캘리그래피를 체험하는 공방입니다.',
}

export function seedBeautifulHangulPlace(places: Place[], seeded: boolean): Place[] {
  return seeded || places.some((place) => place.id === BEAUTIFUL_HANGUL_PLACE.id)
    ? places
    : [...places, { ...BEAUTIFUL_HANGUL_PLACE }]
}

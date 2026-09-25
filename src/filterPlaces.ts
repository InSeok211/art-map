import type { CategoryFilter, Place } from './types'

export interface PlaceFilter {
  query: string
  category: CategoryFilter
}

export function filterPlaces(places: Place[], filter: PlaceFilter): Place[] {
  const query = filter.query.trim().toLocaleLowerCase()

  return places.filter((place) => {
    if (filter.category !== 'all' && place.category !== filter.category) return false
    if (!query) return true

    return [place.name, place.address, place.description]
      .some((value) => value?.toLocaleLowerCase().includes(query))
  })
}

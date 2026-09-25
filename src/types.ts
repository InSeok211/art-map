export type PlaceCategory = 'shop' | 'attraction'

export interface Place {
  id: string
  name: string
  category: PlaceCategory
  latitude: number
  longitude: number
  address?: string
  description?: string
}

export type CategoryFilter = 'all' | PlaceCategory

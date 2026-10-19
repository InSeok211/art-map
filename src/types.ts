export type PlaceCategory = 'shop' | 'attraction' | 'toilets' | 'bus_stop'

export const PLACE_CATEGORY_LABELS: Record<PlaceCategory, string> = {
  shop: '가게', attraction: '명소', toilets: '화장실', bus_stop: '버스 정류장',
}

export const PLACE_CATEGORY_ICONS: Record<PlaceCategory, string> = {
  shop: '⌂', attraction: '✦', toilets: 'WC', bus_stop: 'BUS',
}

export interface Place {
  id: string
  name: string
  category: PlaceCategory
  latitude: number
  longitude: number
  address?: string
  description?: string
  // 장소 사진 주소(작가님 공방처럼 편집 앱에서 올린 사진)
  photo?: string
}

export type CategoryFilter = 'all' | PlaceCategory

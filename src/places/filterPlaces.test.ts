import { describe, expect, it } from 'vitest'
import { filterPlaces } from './filterPlaces'

const places = [
  {
    id: '1', name: '감천문화마을', category: 'attraction' as const,
    latitude: 35.0975, longitude: 129.0103, description: '벽화와 전망',
  },
  {
    id: '2', name: '골목 카페', category: 'shop' as const,
    latitude: 35.098, longitude: 129.011, address: '감내2로 1',
  },
]

describe('filterPlaces', () => {
  it('matches a trimmed query against Korean names and descriptions', () => {
    expect(filterPlaces(places, { query: '  벽화 ', category: 'all' })).toEqual([places[0]])
    expect(filterPlaces(places, { query: ' 카페 ', category: 'all' })).toEqual([places[1]])
  })

  it('matches addresses and applies the category filter', () => {
    expect(filterPlaces(places, { query: '감내2로', category: 'shop' })).toEqual([places[1]])
    expect(filterPlaces(places, { query: '', category: 'attraction' })).toEqual([places[0]])
  })

  it('returns all places in their original order for an empty query', () => {
    expect(filterPlaces(places, { query: ' ', category: 'all' })).toEqual(places)
  })
})

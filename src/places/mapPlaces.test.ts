import { describe, expect, it } from 'vitest'
import { cleanMapPlaces } from './mapPlaces'

const place = { id: 'wc-1', name: '화장실', category: 'toilets', longitude: 129.009, latitude: 35.097 }
describe('public map places', () => {
  it('preserves edited facilities and an empty list after deletion', () => {
    expect(cleanMapPlaces([{ ...place, name: '공중 화장실', description: '운영시간 9~18시' }])?.[0].name).toBe('공중 화장실')
    expect(cleanMapPlaces([{ ...place, category: 'bus_stop' }])?.[0].category).toBe('bus_stop')
    expect(cleanMapPlaces([])).toEqual([])
  })
  it('rejects duplicate ids, unknown categories, long text and invalid positions', () => {
    for (const value of [[place, place], [{ ...place, category: 'unknown' }], [{ ...place, name: 'a'.repeat(81) }], [{ ...place, latitude: NaN }], [{ ...place, longitude: 0 }]]) {
      expect(cleanMapPlaces(value)).toBeNull()
    }
  })
})

import { describe, expect, it } from 'vitest'
import { EMPTY_BUILDING_EDITS, sanitizeBuildingEdits, sanitizeWorkshopInfo, setModel, setOverride, setWorkshopInfo } from './buildingEdits'
import { ARTIST_WORKSHOP_PLACE, artistWorkshopPlace } from '../places/artistWorkshop'
import { ARTIST_WORKSHOP_FOOTPRINT_ID } from '../scene/streetSceneData'

describe('artist workshop editing', () => {
  it('keeps only clean place info and drops unknown photos', () => {
    expect(sanitizeWorkshopInfo({ name: '  꿈꾸는작업실  ', address: '', description: 'x'.repeat(900), photo: 'https://evil.test/a.jpg', extra: 1 }))
      .toEqual({ name: '꿈꾸는작업실', description: 'x'.repeat(500) })
    expect(sanitizeWorkshopInfo({ photo: 'i-abcdef1234' })).toEqual({ photo: 'i-abcdef1234' })
    expect(sanitizeWorkshopInfo({ photo: 'data:image/jpeg;base64,AAAA' })).toEqual({ photo: 'data:image/jpeg;base64,AAAA' })
    expect(sanitizeWorkshopInfo({ photo: 'data:image/svg+xml;base64,AAAA' })).toBeNull()
    expect(sanitizeWorkshopInfo({ name: '   ' })).toBeNull()
  })

  it('stores the info with the building edits and removes it when emptied', () => {
    const edited = setWorkshopInfo(EMPTY_BUILDING_EDITS, { name: '공방' })
    expect(sanitizeBuildingEdits(JSON.parse(JSON.stringify(edited))).workshop).toEqual({ name: '공방' })
    expect(setWorkshopInfo(edited, {})).toEqual(EMPTY_BUILDING_EDITS)
  })

  it('shows the edited info and moves the pin with the workshop or its replacement model', () => {
    expect(artistWorkshopPlace(null)).toEqual(ARTIST_WORKSHOP_PLACE)
    let edits = setWorkshopInfo(EMPTY_BUILDING_EDITS, { description: '새 설명', photo: 'i-abcdef1234' })
    edits = setOverride(edits, ARTIST_WORKSHOP_FOOTPRINT_ID, { placement: { longitude: 129.0093, latitude: 35.0955, rotation: 10, scale: 1 } })
    expect(artistWorkshopPlace(edits)).toMatchObject({ name: ARTIST_WORKSHOP_PLACE.name, description: '새 설명',
      photo: '/api/map-images/i-abcdef1234', longitude: 129.0093, latitude: 35.0955 })
    edits = setModel(edits, 'p-workshop', { id: 'p-workshop', modelId: 'm-abcdefgh12', name: '공방 모델', longitude: 129.0094,
      latitude: 35.0956, rotation: 0, widthMeters: 10, replaces: [ARTIST_WORKSHOP_FOOTPRINT_ID] })
    expect(artistWorkshopPlace(edits)).toMatchObject({ longitude: 129.0094, latitude: 35.0956 })
  })
})

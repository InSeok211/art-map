import { describe, expect, it } from 'vitest'
import { BUILTIN_MODELS, GENERIC_BUILDING_ASSET_IDS } from './modelCatalog'

describe('preview building assets', () => {
  it('marks generic sample buildings for removal while keeping the artist workshop', () => {
    expect(GENERIC_BUILDING_ASSET_IDS.has('rounded-house')).toBe(true)
    expect(GENERIC_BUILDING_ASSET_IDS.has('angular-house')).toBe(true)
    expect(GENERIC_BUILDING_ASSET_IDS.has('rounded-cafe')).toBe(true)
    expect(GENERIC_BUILDING_ASSET_IDS.has('artist-workshop')).toBe(false)
    expect(BUILTIN_MODELS.filter((asset) => asset.category === 'building' && asset.id !== 'artist-workshop')
      .every((asset) => GENERIC_BUILDING_ASSET_IDS.has(asset.id))).toBe(true)
  })
})

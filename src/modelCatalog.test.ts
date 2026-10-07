import { describe, expect, it } from 'vitest'
import { BUILTIN_MODELS, RETIRED_ASSET_IDS } from './modelCatalog'

describe('built-in model assets', () => {
  it('ships the self-made workshop and connected GreenHOUSE concept and retires old samples', () => {
    expect(BUILTIN_MODELS.map((asset) => asset.id)).toEqual(['artist-workshop', 'greenhouse-sixpence', 'beautiful-hangul'])
    expect(BUILTIN_MODELS[0].url).toContain('/assets/models/custom/')
    expect(BUILTIN_MODELS[1].url).toContain('/assets/models/custom/greenhouse-sixpence-connected.glb')
    expect(RETIRED_ASSET_IDS.has('rounded-house')).toBe(true)
    expect(RETIRED_ASSET_IDS.has('angular-lamp')).toBe(true)
    expect(RETIRED_ASSET_IDS.has('artist-workshop')).toBe(false)
  })
})

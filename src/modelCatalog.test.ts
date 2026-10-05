import { describe, expect, it } from 'vitest'
import { BUILTIN_MODELS, RETIRED_ASSET_IDS } from './modelCatalog'

describe('built-in model assets', () => {
  it('ships only the self-made workshop model and retires the old third-party samples', () => {
    expect(BUILTIN_MODELS.map((asset) => asset.id)).toEqual(['artist-workshop'])
    expect(BUILTIN_MODELS[0].url).toContain('/assets/models/custom/')
    expect(RETIRED_ASSET_IDS.has('rounded-house')).toBe(true)
    expect(RETIRED_ASSET_IDS.has('angular-lamp')).toBe(true)
    expect(RETIRED_ASSET_IDS.has('artist-workshop')).toBe(false)
  })
})

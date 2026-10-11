import { describe, expect, it } from 'vitest'
import { applyBuildingEdits, floorsToHeight, heightToFloors, sanitizeBuildingEdits, setOverride, EMPTY_BUILDING_EDITS } from './buildingEdits'
import { getPhotographedStreetBuildings } from './streetSceneData'

describe('building edits', () => {
  const buildings = getPhotographedStreetBuildings().slice(0, 3)
  const [a, b, c] = buildings

  it('hides buildings and overrides height, colours and roof on copies', () => {
    let edits = setOverride(EMPTY_BUILDING_EDITS, a.id, { hidden: true })
    edits = setOverride(edits, b.id, { heightMeters: 12, wallColor: 0x123456, roofColor: 0xabcdef, roofStyle: 'gable' })
    const result = applyBuildingEdits(buildings, edits)
    expect(result.map((building) => building.id)).toEqual([b.id, c.id])
    expect(result[0]).toMatchObject({ heightMeters: 12, wallColor: 0x123456, roofColor: 0xabcdef, roofStyle: 'gable', outline: b.outline })
    expect(result[1]).toBe(c)
    expect(b.heightMeters).not.toBe(12) // 원본은 그대로
  })

  it('reverts a building when its override becomes empty', () => {
    const edits = setOverride(setOverride(EMPTY_BUILDING_EDITS, a.id, { heightMeters: 9 }), a.id, {})
    expect(edits.overrides).toEqual({})
  })

  it('keeps only valid saved values', () => {
    expect(sanitizeBuildingEdits({ overrides: {
      [a.id]: { heightMeters: 999, wallColor: 'red', roofStyle: 'dome', hidden: 'yes' },
      bad: { hidden: true },
      [b.id]: { roofColor: 0xffffff },
    } })).toEqual({ overrides: { [a.id]: { heightMeters: 60 }, [b.id]: { roofColor: 0xffffff } } })
    expect(sanitizeBuildingEdits(null)).toEqual({ overrides: {} })
  })

  it('converts between floors and height like generated buildings', () => {
    expect(floorsToHeight(3)).toBeCloseTo(8.75)
    expect(heightToFloors(8.75)).toBe(3)
    expect(heightToFloors(1)).toBe(1)
  })
})

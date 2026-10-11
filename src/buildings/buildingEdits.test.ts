import { describe, expect, it } from 'vitest'
import { addedBuildingNumber, applyBuildingEdits, floorsToHeight, heightToFloors, NEW_BUILDING_DEFAULTS, sanitizeBuildingEdits, setAdded, setModel, setOverride, EMPTY_BUILDING_EDITS } from './buildingEdits'
import type { PlacedModel } from './buildingEdits'
import type { AddedBuilding } from './buildingEdits'
import { getPhotographedStreetBuildings } from '../scene/streetSceneData'

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
    } })).toEqual({ overrides: { [a.id]: { heightMeters: 60 }, [b.id]: { roofColor: 0xffffff } }, added: [], models: [] })
    expect(sanitizeBuildingEdits(null)).toEqual({ overrides: {}, added: [], models: [] })
  })

  const square: [number, number][] = [[129.0095, 35.096], [129.00958, 35.096], [129.00958, 35.09607], [129.0095, 35.09607]]
  const drawn: AddedBuilding = { id: 'b-test', outline: square, ...NEW_BUILDING_DEFAULTS }

  it('adds drawn buildings as generic street buildings with a negative id', () => {
    const edits = setAdded(EMPTY_BUILDING_EDITS, drawn.id, drawn)
    const result = applyBuildingEdits(buildings, edits)
    expect(result.slice(0, 3)).toEqual(buildings)
    const added = result[3]
    expect(added).toMatchObject({ id: addedBuildingNumber('b-test'), outline: square, heightMeters: 6.1, roofStyle: 'flat', detail: 'context' })
    expect(added.id).toBeLessThan(0)
    expect(addedBuildingNumber('b-test')).toBe(addedBuildingNumber('b-test'))
  })

  it('updates and removes drawn buildings', () => {
    let edits = setAdded(EMPTY_BUILDING_EDITS, drawn.id, drawn)
    edits = setAdded(edits, drawn.id, { ...drawn, heightMeters: 20 })
    expect(edits.added).toHaveLength(1)
    expect(edits.added[0].heightMeters).toBe(20)
    expect(setAdded(edits, drawn.id, null).added).toEqual([])
  })

  it('drops drawn buildings with bad outlines', () => {
    const outside: [number, number][] = [[128, 35], [128.001, 35], [128.001, 35.001]]
    expect(sanitizeBuildingEdits({ overrides: {}, added: [
      drawn,
      { ...drawn, id: 'too-few', outline: square.slice(0, 2) },
      { ...drawn, id: 'outside', outline: outside },
      { ...drawn, id: 'bad id!' },
      { ...drawn, id: 'roof', roofStyle: 'dome' },
    ] }).added.map((building) => building.id)).toEqual(['b-test'])
  })

  const placed: PlacedModel = { id: 'p-1', modelId: 'm-abcdef1234', name: '공방', longitude: 129.0095, latitude: 35.096, rotation: 370, widthMeters: 500, replaces: [] }

  it('hides buildings replaced by a placed model and restores them when it is removed', () => {
    const edits = setModel(EMPTY_BUILDING_EDITS, placed.id, { ...placed, replaces: [a.id] })
    expect(edits.models[0]).toMatchObject({ rotation: 10, widthMeters: 120, replaces: [a.id] })
    expect(applyBuildingEdits(buildings, edits).map((building) => building.id)).toEqual([b.id, c.id])
    expect(applyBuildingEdits(buildings, setModel(edits, placed.id, null))).toBe(buildings)
  })

  it('drops placed models with bad file ids or positions', () => {
    expect(sanitizeBuildingEdits({ models: [
      placed,
      { ...placed, id: 'p-2', modelId: '../secret' },
      { ...placed, id: 'p-3', longitude: 128 },
      { ...placed, id: 'p-4', replaces: [-1, 'x', a.id, a.id] },
    ] }).models.map((model) => [model.id, model.replaces])).toEqual([['p-1', []], ['p-4', [a.id]]])
  })

  it('converts between floors and height like generated buildings', () => {
    expect(floorsToHeight(3)).toBeCloseTo(8.75)
    expect(heightToFloors(8.75)).toBe(3)
    expect(heightToFloors(1)).toBe(1)
  })
})

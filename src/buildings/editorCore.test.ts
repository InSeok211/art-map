import { describe, expect, it } from 'vitest'
import { outlinePlacement, placedOutline } from './buildingSettings'
import { EMPTY_BUILDING_EDITS, sanitizeBuildingEdits, setModel, setOverride } from './buildingEdits'
import { EditHistory } from './editHistory'
import { streetLngLat, streetMeters } from '../map/streetCoordinates'

describe('local editor data', () => {
  it('moves, rotates and scales in metres without changing the original footprint', () => {
    const outline = [[0, 0], [10, 0], [10, 4], [0, 4]].map((p) => streetLngLat(p as [number, number]))
    const original = JSON.stringify(outline), base = outlinePlacement(outline)
    const moved = placedOutline(outline, { ...base, rotation: 90, scale: 2 })
    const [cx, cz] = streetMeters([base.longitude, base.latitude]), [x, z] = streetMeters(moved[0])
    expect(x - cx).toBeCloseTo(4, 5); expect(z - cz).toBeCloseTo(-10, 5)
    expect(JSON.stringify(outline)).toBe(original)
  })
  it('persists separate flat and terrain settings and rejects invalid placement', () => {
    const edits = sanitizeBuildingEdits({ overrides: { 123: { name: '건물 A', flatBaseMeters: 2,
      terrain: { offsetMeters: -1.5, baseElevationMeters: 95, entrance: [129.0095, 35.096], foundation: false },
      placement: { longitude: 0, latitude: 0, rotation: 10, scale: 2 } } } })
    expect(edits.overrides[123]).toEqual({ name: '건물 A', flatBaseMeters: 2,
      terrain: { offsetMeters: -1.5, baseElevationMeters: 95, entrance: [129.0095, 35.096], foundation: false } })
  })
  it('groups slider changes into one undo and clears redo after a new action', () => {
    const history = new EditHistory(EMPTY_BUILDING_EDITS)
    history.change(setOverride(history.current, 123, { heightMeters: 9 }), 1000)
    history.change(setOverride(history.current, 123, { heightMeters: 12 }), 1100)
    expect(history.undo()).toEqual(EMPTY_BUILDING_EDITS)
    expect(history.redo()!.overrides[123].heightMeters).toBe(12)
    history.undo(); history.change(setOverride(history.current, 456, { hidden: true }), 2000)
    expect(history.canRedo).toBe(false)
  })
  it('retains model files that undo can restore after deleting a placement', () => {
    const model = { id: 'p-test', modelId: 'm-testmodel123', name: '모델', longitude: 129.0095, latitude: 35.096, widthMeters: 10, rotation: 0, replaces: [] }
    const history = new EditHistory(setModel(EMPTY_BUILDING_EDITS, model.id, model))
    history.change(setModel(history.current, model.id, null))
    expect(history.modelIds.has(model.modelId)).toBe(true)
    expect(history.undo()!.models[0].id).toBe(model.id)
  })
})

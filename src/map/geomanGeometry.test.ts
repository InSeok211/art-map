import { describe, expect, it } from 'vitest'
import { geometryPoints, validateGeometry } from './geomanGeometry'
import { addedToStreetBuilding, NEW_BUILDING_DEFAULTS, sanitizeBuildingEdits, setAdded } from '../buildings/buildingEdits'
import { EMPTY_BUILDING_EDITS } from '../buildings/buildingEdits'
import { alleysToGeoJSON, sanitizeAlleys } from '../alleys/alleys'

const outline: [number, number][] = [[129.0100, 35.0970], [129.0102, 35.0970], [129.0102, 35.0972], [129.0100, 35.0972]]

describe('Geoman geometry adapters', () => {
  it('round trips an edited alley through existing persistence and rendering', () => {
    const points = geometryPoints({ type: 'LineString', coordinates: outline.slice(0, 3) })!
    expect(validateGeometry(points, 'line')).toBe('')
    const saved = sanitizeAlleys([{ id: 'alley-test', coordinates: points, widthMeters: 4.5, name: '시험 골목' }])
    expect(alleysToGeoJSON(saved, 'alley-test').features[0].geometry.coordinates).toEqual(points)
    expect(saved[0].name).toBe('시험 골목')
  })
  it('removes only the closing vertex and persists the outline for the 3D scene', () => {
    const points = geometryPoints({ type: 'Polygon', coordinates: [[...outline, outline[0]]] })!
    expect(points).toEqual(outline)
    expect(validateGeometry(points, 'polygon')).toBe('')
    const draft = setAdded(EMPTY_BUILDING_EDITS, 'b-test', { id: 'b-test', outline: points, ...NEW_BUILDING_DEFAULTS })
    const restored = sanitizeBuildingEdits(JSON.parse(JSON.stringify(draft)))
    expect(addedToStreetBuilding(restored.added[0]).outline).toEqual(outline)
  })
  it('rejects outside coordinates, incomplete and tiny buildings, and polygons with holes', () => {
    expect(validateGeometry([[129.01, 35.08], outline[0]], 'line')).toContain('사각형')
    expect(validateGeometry(outline.slice(0, 2), 'polygon')).toContain('세 개')
    expect(validateGeometry([outline[0], [129.010001, 35.097], [129.010001, 35.097001]], 'polygon')).toContain('4㎡')
    expect(geometryPoints({ type: 'Polygon', coordinates: [[...outline, outline[0]], [...outline, outline[0]]] })).toBeNull()
    expect(validateGeometry([outline[0], outline[2], outline[1], outline[3]], 'polygon')).toContain('교차')
  })
})

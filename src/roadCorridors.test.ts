import { describe, expect, it } from 'vitest'
import { displayRoadWidth, roadWidth } from './roadCorridors'

describe('alley display widths', () => {
  it('keeps mapped pedestrian alleys legible without widening the main road', () => {
    expect(displayRoadWidth({ type: 'path', width: 0.5 })).toBeGreaterThanOrEqual(1.8)
    expect(displayRoadWidth({ type: 'footway' })).toBeGreaterThan(1.65)
    expect(displayRoadWidth({ type: 'service' })).toBeGreaterThan(2.85)
    expect(displayRoadWidth({ type: 'tertiary' })).toBe(6.5)
    expect(roadWidth({ type: 'path', width: 0.5 })).toBe(0.5)
  })
})

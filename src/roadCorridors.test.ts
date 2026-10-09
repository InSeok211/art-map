import { describe, expect, it } from 'vitest'
import { displayRoadWidth, FOOT_ROAD_TYPES, roadWidth } from './roadCorridors'

describe('road widths', () => {
  it('draws roads a little wider than their standard widths and uses one width for drawing and trimming buildings', () => {
    expect(roadWidth({ type: 'tertiary' })).toBe(7.6)
    expect(roadWidth({ type: 'residential' })).toBe(5.8)
    expect(roadWidth({ type: 'service' })).toBe(3.6)
    expect(roadWidth({ type: 'footway' })).toBe(2.8)
    expect(roadWidth({ type: 'steps' })).toBe(2.6)
    // 폭이 적힌 길은 15% 넓히고, 아주 좁게 적힌 골목도 2.4m 이상으로 보이게 합니다.
    expect(roadWidth({ type: 'service', width: 3 })).toBeCloseTo(3.45, 5)
    expect(roadWidth({ type: 'path', width: 0.5 })).toBe(2.4)
    expect(displayRoadWidth).toBe(roadWidth)
    expect(FOOT_ROAD_TYPES.has('steps')).toBe(true)
    expect(FOOT_ROAD_TYPES.has('service')).toBe(false)
  })
})

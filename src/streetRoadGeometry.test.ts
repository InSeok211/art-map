import { describe, expect, it } from 'vitest'
import { roadOutlines } from './streetRoadGeometry'

describe('road surface outlines', () => {
  it('ends a straight road at its mapped endpoints without a circular overshoot', () => {
    const shapes = roadOutlines([{ points: [[0, 0], [10, 0]], width: 4, type: 'residential', gaps: [] }])
    const xs = shapes.flatMap((polygon) => polygon[0].map(([x]) => x))
    expect(Math.min(...xs)).toBeCloseTo(0)
    expect(Math.max(...xs)).toBeCloseTo(10)
  })
})

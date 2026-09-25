import { describe, expect, it } from 'vitest'
import { convexHull, lineCrossesPolygon, pointInConvexPolygon, shrinkPolygon } from './occlusion'
import type { Point } from './occlusion'

const square: Point[] = [[0, 0], [10, 0], [10, 10], [0, 10]]

describe('occlusion geometry', () => {
  it('builds the outline of projected box corners', () => {
    const hull = convexHull([[0, 0], [10, 0], [10, 10], [0, 10], [5, 5], [3, 7]])

    expect(hull).toHaveLength(4)
    expect(pointInConvexPolygon([5, 5], hull)).toBe(true)
    expect(pointInConvexPolygon([11, 5], hull)).toBe(false)
  })

  it('detects a road that passes behind a model even without a point inside it', () => {
    const hull = convexHull(square)

    expect(lineCrossesPolygon([[-5, 5], [15, 5]], hull)).toBe(true)
    expect(lineCrossesPolygon([[2, 2], [3, 3]], hull)).toBe(true)
    expect(lineCrossesPolygon([[-5, 15], [15, 15]], hull)).toBe(false)
  })

  it('ignores a road that only grazes the model edge after shrinking', () => {
    const hull = shrinkPolygon(convexHull(square), 0.1)

    expect(lineCrossesPolygon([[-5, 0.2], [15, 0.2]], hull)).toBe(false)
    expect(lineCrossesPolygon([[-5, 5], [15, 5]], hull)).toBe(true)
  })
})

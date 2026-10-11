import { describe, expect, it } from 'vitest'
import { isSafeGableOutline } from './streetRoofGeometry'

describe('gable roof footprint', () => {
  it('does not span an L shaped footprint with a rectangular roof', () => {
    expect(isSafeGableOutline([[0, 0], [10, 0], [10, 10], [5, 10], [5, 5], [0, 5]])).toBe(false)
  })

  it('allows a rectangular building to keep its pitched roof', () => {
    expect(isSafeGableOutline([[0, 0], [10, 0], [10, 6], [0, 6]])).toBe(true)
  })
})

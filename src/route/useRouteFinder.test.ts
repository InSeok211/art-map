import { describe, expect, it } from 'vitest'
import { routePadding } from './useRouteFinder'

describe('route camera padding', () => {
  it('does not add the mobile route sheet space twice', () => {
    const map = {
      getContainer: () => ({ clientWidth: 375, clientHeight: 812 }),
      getPadding: () => ({ top: 0, right: 0, bottom: 480, left: 0 }),
    } as unknown as Parameters<typeof routePadding>[0]

    expect(routePadding(map)).toEqual({ top: 80, right: 60, bottom: 0, left: 40 })
  })

  it('does not add another left margin over the desktop panel', () => {
    const map = {
      getContainer: () => ({ clientWidth: 1440, clientHeight: 900 }),
      getPadding: () => ({ top: 0, right: 0, bottom: 0, left: 420 }),
    } as unknown as Parameters<typeof routePadding>[0]

    expect(routePadding(map)).toEqual({ top: 70, right: 70, bottom: 70, left: 0 })
  })
})

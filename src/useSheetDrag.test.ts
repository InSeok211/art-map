import { describe, expect, it } from 'vitest'
import { SHEET_PEEK, sheetOpenHeight, sheetSnapOpen } from './useSheetDrag'

describe('bottom sheet drag', () => {
  const open = sheetOpenHeight(800)

  it('matches the open height of the CSS sheet', () => {
    expect(open).toBeCloseTo(544)
    expect(sheetOpenHeight(1200)).toBe(560)
  })

  it('snaps to the nearer state when released slowly', () => {
    expect(sheetSnapOpen(SHEET_PEEK + 40, 0, open)).toBe(false)
    expect(sheetSnapOpen(open - 40, 0, open)).toBe(true)
  })

  it('follows a quick flick regardless of position', () => {
    // 아래쪽에서 빠르게 위로 쓸면 펼치고, 위쪽에서 빠르게 아래로 쓸면 접습니다.
    expect(sheetSnapOpen(SHEET_PEEK + 20, -0.8, open)).toBe(true)
    expect(sheetSnapOpen(open - 20, 0.8, open)).toBe(false)
  })
})

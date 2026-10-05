import { describe, expect, it } from 'vitest'
import { angleDelta, bearingBetween, compassHeading } from './useMyLocation'

describe('my location heading', () => {
  it('turns the arrow the short way round', () => {
    expect(angleDelta(350, 10)).toBe(20)
    expect(angleDelta(10, 350)).toBe(-20)
    expect(angleDelta(0, 180)).toBe(-180)
  })

  it('reads the compass from iOS and absolute Android orientation events', () => {
    expect(compassHeading({ webkitCompassHeading: 90, alpha: 10, absolute: false } as never)).toBe(90)
    // 안드로이드 절대 방위: alpha는 반시계 방향이라 360에서 뺍니다.
    expect(compassHeading({ alpha: 90, absolute: true } as never)).toBe(270)
    // 상대 방위(absolute=false)는 북쪽을 알 수 없어 쓰지 않습니다.
    expect(compassHeading({ alpha: 90, absolute: false } as never)).toBeNull()
    // 화면을 가로로 돌리면 그만큼 더합니다.
    expect(compassHeading({ webkitCompassHeading: 300 } as never, 90)).toBe(30)
  })

  it('measures the walking direction between two fixes', () => {
    expect(bearingBetween([129.00884, 35.0943657], [129.00884, 35.0944557])).toBeCloseTo(0, 0)
    expect(bearingBetween([129.00884, 35.0943657], [129.00894, 35.0943657])).toBeCloseTo(90, 0)
  })
})

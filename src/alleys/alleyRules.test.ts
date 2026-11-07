import { describe, expect, it } from 'vitest'
import { alleyProblem, lineProblem, MAX_LINE_POINTS } from './alleyRules'
import { sanitizeAlleys } from './alleys'
import { RECORDED_ALLEYS } from './recordedAlleys'
import { validateGeometry } from '../map/geomanGeometry'
import recorded from '../data/recorded-alleys.json'

const insideWorkArea: [number, number] = [129.009, 35.095]
// 작업 범위(동쪽 129.0135)의 바깥이지만 지도(동쪽 약 129.0173) 안쪽입니다.
const mapOnly: [number, number] = [129.015, 35.095]
const outsideMap: [number, number] = [129.02, 35.095]
const alley = (extra: object = {}) => ({ id: 'a1', coordinates: [insideWorkArea, mapOnly], widthMeters: 3, ...extra })

describe('골목길 범위', () => {
  it('편집 화면이 그릴 수 있는 선은 저장 규칙도 받아들인다', () => {
    expect(validateGeometry([insideWorkArea, mapOnly], 'line')).toBe('')
    expect(lineProblem([insideWorkArea, mapOnly])).toBeNull()
  })

  it('편집 화면이 막는 선은 저장 규칙도 막는다', () => {
    expect(validateGeometry([insideWorkArea, outsideMap], 'line')).not.toBe('')
    expect(lineProblem([insideWorkArea, outsideMap])).toMatch(/지도 범위/)
    const tooMany = Array.from({ length: MAX_LINE_POINTS + 1 }, () => insideWorkArea)
    expect(validateGeometry(tooMany, 'line')).not.toBe('')
    expect(lineProblem(tooMany)).toMatch(/2~500/)
  })

  it('규칙에 어긋나면 이유를 알려 준다', () => {
    expect(alleyProblem(alley())).toBeNull()
    expect(alleyProblem(alley({ name: '계단길' }))).toBeNull()
    for (const [value, reason] of [
      [null, /형식/],
      ['문자열', /형식/],
      [alley({ id: '' }), /번호/],
      [alley({ id: 7 }), /번호/],
      [alley({ id: 'x'.repeat(81) }), /번호/],
      [alley({ name: 3 }), /이름/],
      [alley({ name: '가'.repeat(61) }), /이름/],
      [alley({ widthMeters: 0.5 }), /폭/],
      [alley({ widthMeters: 8.5 }), /폭/],
      [alley({ widthMeters: '3' }), /폭/],
      [alley({ coordinates: [insideWorkArea] }), /2~500/],
      [alley({ coordinates: [insideWorkArea, ['129', '35']] }), /좌표/],
      [alley({ coordinates: [insideWorkArea, [Number.NaN, 35]] }), /좌표/],
      [alley({ coordinates: [insideWorkArea, outsideMap] }), /지도 범위/],
    ] as const) expect(alleyProblem(value), JSON.stringify(value)).toMatch(reason)
  })

  it('화면이 읽을 때도 같은 규칙으로 걸러 원본 항목을 그대로 돌려준다', () => {
    const good = alley()
    expect(sanitizeAlleys([good, alley({ id: 'a2', coordinates: [insideWorkArea, outsideMap] }), null])).toEqual([good])
    expect(sanitizeAlleys('목록 아님')).toEqual([])
  })

  it('지금 싣고 있는 골목길은 모두 규칙에 맞는다', () => {
    expect(RECORDED_ALLEYS.length).toBe((recorded as unknown[]).length)
  })
})

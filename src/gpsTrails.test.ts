import { describe, expect, it } from 'vitest'
import { cleanTrail, findAlleyCandidates, sanitizeTrails } from './gpsTrails'
import type { GpsTrail, TrailPoint } from './gpsTrails'
import type { LngLat } from './alleys'

const M_LAT = 111_320
const M_LON = M_LAT * Math.cos(35.0949 * Math.PI / 180)
const at = (x: number, z: number): LngLat => [129.0089 + x / M_LON, 35.0949 - z / M_LAT]

// 동쪽으로 0→length m를 1초에 1m씩 걷는 기록. offset(m)만큼 남북으로 어긋나고, 점마다 jitter만큼 흔들립니다.
function walk(id: string, length: number, offset = 0, jitter = 0, accuracy = 6): GpsTrail {
  const points: TrailPoint[] = []
  for (let x = 0; x <= length; x++) {
    const [lng, lat] = at(x, offset + (x % 2 ? jitter : -jitter))
    points.push([lng, lat, accuracy, x * 1000])
  }
  return { id, startedAt: '2026-10-09T00:00:00Z', points }
}

describe('GPS trail cleaning', () => {
  it('drops inaccurate points and single GPS jumps', () => {
    const trail = walk('a', 20)
    trail.points[5] = [...at(5, 60), 6, 5000] as TrailPoint // 60m 튐
    trail.points[8][2] = 45 // 정확도 45m
    const [piece] = cleanTrail(trail.points)
    expect(piece).toHaveLength(19)
    expect(Math.max(...piece.map(([, z]) => Math.abs(z)))).toBeLessThan(1)
  })

  it('splits a trail where the recording paused', () => {
    const trail = walk('a', 20)
    trail.points = trail.points.map(([lng, lat, accuracy, time], index) => [lng, lat, accuracy, time + (index > 10 ? 120_000 : 0)])
    expect(cleanTrail(trail.points)).toHaveLength(2)
  })

  it('keeps only well-formed trails', () => {
    expect(sanitizeTrails([{ id: 'a', startedAt: 'x', points: [[1, 2, 3, 4], [1, 2]] }, { id: 3 }])).toEqual([
      { id: 'a', startedAt: 'x', points: [[1, 2, 3, 4]] },
    ])
  })
})

describe('alley candidates', () => {
  const trails = [walk('a', 40, -1.2, 0.8), walk('b', 40, 0.4, 1), walk('c', 40, 1.5, 0.6)]

  it('turns a path walked at different times into a centred alley', () => {
    const [candidate, ...rest] = findAlleyCandidates(trails, { threshold: 3, known: [] })
    expect(rest).toHaveLength(0)
    expect(candidate.passes).toBe(3)
    expect(candidate.lengthMeters).toBeGreaterThan(32)
    // 세 기록의 가운데(약 0.2m) 가까이에 놓입니다.
    for (const [, lat] of candidate.coordinates) expect(Math.abs((35.0949 - lat) * M_LAT - 0.23)).toBeLessThan(1.5)
  })

  it('needs as many separate recordings as the threshold', () => {
    expect(findAlleyCandidates(trails.slice(0, 2), { threshold: 3, known: [] })).toHaveLength(0)
    expect(findAlleyCandidates(trails, { threshold: 4, known: [] })).toHaveLength(0)
    expect(findAlleyCandidates(trails.slice(0, 2), { threshold: 2, known: [] })).toHaveLength(1)
  })

  it('counts walking back and forth in one recording only once', () => {
    const there = walk('a', 40)
    const back = there.points.map(([lng, lat, accuracy], index) => [lng, lat, accuracy, 41_000 + index * 1000] as TrailPoint).reverse()
    const repeated = { ...there, points: [...there.points, ...back, ...there.points.map(([lng, lat, accuracy, time]) => [lng, lat, accuracy, time + 90_000] as TrailPoint)] }
    expect(findAlleyCandidates([repeated], { threshold: 2, known: [] })).toHaveLength(0)
  })

  it('ignores walks along roads that are already on the map', () => {
    expect(findAlleyCandidates(trails, { threshold: 3, known: [{ points: [at(-10, 0), at(50, 0)], width: 4 }] })).toHaveLength(0)
  })

  it('hides dismissed candidates and joins an alley to the road it meets', () => {
    expect(findAlleyCandidates(trails, { threshold: 3, known: [], dismissed: [[at(0, 0), at(40, 0)]] })).toHaveLength(0)
    // 기록 동쪽 끝에서 남북으로 지나는 길
    const [candidate] = findAlleyCandidates(trails, { threshold: 3, known: [{ points: [at(46, -30), at(46, 30)], width: 4 }] })
    const east = Math.max(...candidate.coordinates.map(([lng]) => (lng - 129.0089) * M_LON))
    expect(east).toBeCloseTo(46, 0)
  })
})

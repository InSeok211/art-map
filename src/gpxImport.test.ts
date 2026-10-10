// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { gpxToTrails, parseGpx } from './gpxImport'

const M_LAT = 111_320
// 북쪽으로 step m씩 count개, seconds 초 간격으로 걷는 GPX(정확도 10m 점은 6m 넘게 움직여야 남으므로 기본 7m)
function gpx(count: number, { step = 7, seconds = 4, start = '2026-10-10T07:00:00Z', hdop, timeless = false, pauseAt }: {
  step?: number; seconds?: number; start?: string; hdop?: number; timeless?: boolean; pauseAt?: number
} = {}) {
  const t0 = Date.parse(start)
  const points = Array.from({ length: count }, (_, index) => {
    const pause = pauseAt !== undefined && index >= pauseAt ? 20 * 60_000 : 0
    const time = new Date(t0 + index * seconds * 1000 + pause).toISOString()
    return `<trkpt lat="${35.0960 + index * step / M_LAT}" lon="129.0096">${timeless ? '' : `<time>${time}</time>`}${hdop ? `<hdop>${hdop}</hdop>` : ''}</trkpt>`
  })
  return `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>${points.join('')}</trkseg></trk>
    <wpt lat="35.1" lon="129.1"><name>not a walk</name></wpt></gpx>`
}

describe('GPX import', () => {
  it('reads track points with time and accuracy', () => {
    const points = parseGpx(gpx(3, { hdop: 1.2 }))
    expect(points).toHaveLength(3)
    expect(points[0]).toEqual([129.0096, 35.096, 6, Date.parse('2026-10-10T07:00:00Z')])
    expect(points[2][3] - points[0][3]).toBe(8000)
  })

  it('turns a walk into one trail with the same rules as the map recorder', () => {
    const [trail, ...rest] = gpxToTrails(gpx(20))
    expect(rest).toHaveLength(0)
    expect(trail.points).toHaveLength(20)
    expect(trail.startedAt).toBe('2026-10-10T07:00:00.000Z')
  })

  it('drops inaccurate points and standing jitter, and skips walks shorter than 30m', () => {
    expect(gpxToTrails(gpx(20, { hdop: 6 }))).toHaveLength(0) // 정확도 30m
    expect(gpxToTrails(gpx(5))).toHaveLength(0) // 20m
    expect(gpxToTrails(gpx(40, { step: 1 }))[0].points.length).toBeLessThan(15) // 1m씩 흔들림
  })

  it('splits a walk with a long pause into separate trails and handles files without time', () => {
    expect(gpxToTrails(gpx(30, { pauseAt: 15 }))).toHaveLength(2)
    expect(gpxToTrails(gpx(20, { timeless: true }))).toHaveLength(1)
  })

  it('rejects files that are not GPX', () => {
    expect(() => parseGpx('<gpx><trk>')).toThrow()
  })
})

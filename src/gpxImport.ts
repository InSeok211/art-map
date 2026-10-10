import type { GpsTrail, TrailPoint } from './gpsTrails'
import { splitIntoTrails } from './trailFixes'

// GPS 기록 앱(화면을 꺼도 기록되는 앱)에서 내보낸 GPX 파일을 골목길 기록으로 바꿉니다. 지도의 자동 기록과
// 같은 규칙(trailFixes.ts)으로 점을 거르고 기록을 나눕니다.
//  - 트랙 점(trkpt)만 읽습니다(경로 계획 rtept, 장소 표시 wpt는 실제로 걸은 길이 아님).
//  - 정확도: GPX 표준 hdop(위성 배치로 본 오차 배수)가 있으면 약 5m를 곱해 쓰고, 없으면 10m로 봅니다.
//  - 시각이 없는 파일은 점마다 1초씩 지난 것으로 봅니다(같은 파일은 한 번 걸은 것으로 셈).
const METERS_PER_HDOP = 5
const DEFAULT_ACCURACY = 10

export function parseGpx(text: string, fallbackStart = Date.now()): TrailPoint[] {
  const document = new DOMParser().parseFromString(text, 'application/xml')
  if (document.getElementsByTagName('parsererror').length) throw new Error('GPX 파일을 읽지 못했습니다.')
  const points: TrailPoint[] = []
  const trackPoints = Array.from(document.getElementsByTagNameNS('*', 'trkpt'))
  trackPoints.forEach((element, index) => {
    const latitude = Number(element.getAttribute('lat')), longitude = Number(element.getAttribute('lon'))
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return
    const child = (name: string) => element.getElementsByTagNameNS('*', name)[0]?.textContent?.trim()
    const time = Date.parse(child('time') ?? '')
    const hdop = Number(child('hdop'))
    const accuracy = Number.isFinite(hdop) && hdop > 0 ? hdop * METERS_PER_HDOP : DEFAULT_ACCURACY
    points.push([
      Math.round(longitude * 1e7) / 1e7, Math.round(latitude * 1e7) / 1e7,
      Math.round(accuracy * 10) / 10, Number.isFinite(time) ? time : fallbackStart + index * 1000,
    ])
  })
  return points.sort((a, b) => a[3] - b[3])
}

export function gpxToTrails(text: string): GpsTrail[] {
  return splitIntoTrails(parseGpx(text))
}

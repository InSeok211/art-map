import * as polygonClipping from 'polygon-clipping'

// 도로 중심선을 차도 면으로 바꾸는 순수 계산입니다. 거리 장면(도로 그리기)과 건물 데이터(도로 침범 보정)가
// 같은 폭·같은 면을 쓰도록 다른 모듈에 의존하지 않게 둡니다. 좌표는 장면 기준 미터(동, 남)입니다.

export type RoadRun = { points: [number, number][]; width: number; type: string; gaps: [number, number][] }

// OSM은 중심선만 주므로 폭이 없는 도로는 종류별 기본 폭(m)을 씁니다.
const DEFAULT_ROAD_WIDTHS: Record<string, number> = {
  motorway: 14, trunk: 12, primary: 10, secondary: 8,
  tertiary: 6.5, pedestrian: 4, footway: 1.65, steps: 1.65, path: 2.4, service: 2.85,
}

export function roadWidth(way: { type: string; width?: number }) {
  return way.width ?? DEFAULT_ROAD_WIDTHS[way.type] ?? 4.8
}

// 촬영한 거리(감내1로 구간)는 영상에서 본 포장 폭으로 그립니다.
export const PHOTOGRAPHED_ROAD_WIDTH = 5.9

export function roadOutlines(runs: RoadRun[], sidewalk = false): polygonClipping.Polygon[] {
  const polygons: polygonClipping.Polygon[] = []
  for (const run of runs) {
    if (run.type === 'footway') continue
    const extra = sidewalk ? run.type === 'path' ? 0.45 : 1.2 : 0
    const halfWidth = (run.width + extra) / 2
    const points = run.points.filter((point, index) => index === 0
      || Math.hypot(point[0] - run.points[index - 1][0], point[1] - run.points[index - 1][1]) > 0.05)
    if (points.length < 2) continue
    // Buffer each centreline segment and only its interior vertices. Rounded
    // end caps overrun mapped junctions and create circular road patches.
    for (let index = 0; index < points.length - 1; index++) {
      const [ax, az] = points[index]
      const [bx, bz] = points[index + 1]
      const length = Math.hypot(bx - ax, bz - az)
      const nx = (az - bz) / length * halfWidth
      const nz = (bx - ax) / length * halfWidth
      polygons.push([[
        [ax + nx, az + nz], [bx + nx, bz + nz],
        [bx - nx, bz - nz], [ax - nx, az - nz],
        [ax + nx, az + nz],
      ]])
    }
    for (const [x, z] of points.slice(1, -1)) {
      const ring: polygonClipping.Ring = []
      for (let step = 0; step < 16; step++) {
        const angle = step / 16 * Math.PI * 2
        ring.push([x + Math.cos(angle) * halfWidth, z + Math.sin(angle) * halfWidth])
      }
      ring.push(ring[0])
      polygons.push([ring])
    }
  }
  // Millimetre precision prevents near-identical joins producing microscopic
  // segments in the polygon sweep when hundreds of roads meet.
  return polygons.map((polygon) => polygon.map((ring) => ring.map(([x, z]) => [
    Math.round(x * 1000) / 1000, Math.round(z * 1000) / 1000,
  ])))
}

function snapArea(area: polygonClipping.MultiPolygon): polygonClipping.MultiPolygon {
  return area.map((polygon) => polygon.map((ring) => ring.map(([x, z]) => [
    Math.round(x * 1000) / 1000, Math.round(z * 1000) / 1000,
  ])))
}

export function unionRoadAreas(polygons: polygonClipping.Polygon[]): polygonClipping.MultiPolygon {
  let areas = polygons.map((polygon) => [polygon] as polygonClipping.MultiPolygon)
  // Merge in small balanced steps, snapping every result before the next
  // sweep. A single operation over thousands of overlapping buffers magnifies
  // floating point intersections into zero-length segments.
  while (areas.length > 1) {
    const next: polygonClipping.MultiPolygon[] = []
    for (let i = 0; i < areas.length; i += 2) {
      next.push(i + 1 < areas.length ? snapArea(polygonClipping.union(areas[i], areas[i + 1])) : areas[i])
    }
    areas = next
  }
  return areas[0] ?? []
}

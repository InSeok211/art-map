import * as polygonClipping from 'polygon-clipping'

// 도로 중심선을 차도 면으로 바꾸는 순수 계산입니다. 거리 장면(도로 그리기)과 건물 데이터(도로 침범 보정)가
// 같은 폭·같은 면을 쓰도록 다른 모듈에 의존하지 않게 둡니다. 좌표는 장면 기준 미터(동, 남)입니다.

export type RoadRun = { points: [number, number][]; width: number; type: string; gaps: [number, number][] }

// OSM은 중심선만 주므로 폭이 없는 도로는 종류별 기본 폭(m)을 씁니다. 3D 건물 사이에서 길이 잘 보이도록
// 실제 표준 폭보다 조금 넓게 잡았습니다(2026-10-09). 도로를 그릴 때와 건물을 도로에서 깎아 낼 때 같은 폭을 써서,
// 그린 길 위로 건물이 튀어나오지 않게 합니다.
const DEFAULT_ROAD_WIDTHS: Record<string, number> = {
  motorway: 15, trunk: 13, primary: 11, secondary: 9, secondary_link: 6.5,
  tertiary: 7.6, tertiary_link: 6, residential: 5.8, living_street: 5, pedestrian: 4.8,
  service: 3.6, track: 3.2,
  // 골목길(보행로·좁은 길·계단)은 3D 건물 사이에서 알아볼 수 있도록 넉넉히 잡습니다.
  path: 2.8, footway: 2.8, steps: 2.6,
}
// 골목길 가장자리의 밝은 돌 테두리(양쪽을 합친 폭, m). 건물은 이 테두리 바깥까지 깎습니다.
export const ALLEY_EDGE = 0.4
// 보행로 종류(차도와 달리 건물 사이 통로로 그려진 경우가 많음)
export const FOOT_ROAD_TYPES = new Set(['footway', 'path', 'steps'])

// 사진·현장에서 확인한 실제 폭(m)으로 덮어쓰는 길(OSM 길 번호).
// 감내1로175번안길 들머리(그린하우스 옆 골목): OSM에는 보행로(footway)로 올라 기본 폭이 좁지만, 사용자가 찍은
// 사진에서 사람이 오가는 폭 약 4m의 골목입니다.
export const GAMNAE_175_LANE_ID = 1496857838
export const ROAD_WIDTH_OVERRIDES: Record<number, number> = { [GAMNAE_175_LANE_ID]: 4 }

export function roadWidth(way: { type: string; width?: number; id?: number }) {
  if (way.id !== undefined && ROAD_WIDTH_OVERRIDES[way.id] !== undefined) return ROAD_WIDTH_OVERRIDES[way.id]
  // 폭이 적힌 길도 15% 넓히고, 골목길도 지도에서 알아볼 만큼(2.4m) 이상으로 그립니다.
  if (way.width !== undefined) return Math.max(2.4, way.width * 1.15)
  return DEFAULT_ROAD_WIDTHS[way.type] ?? 5.2
}

// 예전 이름(그리는 폭). 이제 그리는 폭과 깎는 폭이 같습니다.
export const displayRoadWidth = roadWidth

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

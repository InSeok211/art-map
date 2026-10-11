import * as polygonClipping from 'polygon-clipping'
import { ALLEY_EDGE, displayRoadWidth, FOOT_ROAD_TYPES, PHOTOGRAPHED_ROAD_WIDTH, roadOutlines, unionRoadAreas } from './roadCorridors'
import type { RoadRun } from './roadCorridors'
import { clearRoadOfKeptBuildings, MEETING_CIRCLE_CENTER, MEETING_CIRCLE_RADIUS, streetMeters } from './streetSceneData'
import type { StreetBuilding } from './streetSceneData'
import { markRoadJunctions, PHOTOGRAPHED_ROAD_POINTS, roadPieces } from './streetRoadGeometry'
import { clipSegmentToBounds, STREET_SURFACE_WAYS } from './streetSurfaceData'
import type { SceneBounds } from './streetSurfaceData'

// 거리 장면 바닥의 도로·보도 면입니다. 수천 개의 도로 조각을 합치고 건물 자리를 빼는 계산이라 장면 만들기
// 시간의 대부분(약 10초)을 차지해서, scripts/build-road-ground.mjs가 미리 계산해 src/generated/road-ground.json에
// 저장합니다. 거리 장면은 저장본을 그대로 그리고, 입력이 바뀌면 테스트가 다시 만들라고 알려 줍니다.
// 좌표는 장면 기준 미터(동, 남)입니다.

export interface RoadGround {
  roads: polygonClipping.MultiPolygon // 차도
  outer: polygonClipping.MultiPolygon // 차도 가장자리 아래로 보이는 돌 포장
  footways: polygonClipping.MultiPolygon // 골목길(보행로·좁은 길·계단), 차도와 다른 색으로 그림
  kerbStone: polygonClipping.MultiPolygon // 촬영 거리 양옆 보도 띠
  kerbLine: polygonClipping.MultiPolygon // 촬영 거리 가장자리 선
  meeting: polygonClipping.MultiPolygon // 갈림길 원형 포장
}

// 촬영 거리의 양옆 보도 띠(폭, 중심선에서 떨어진 거리)
export const KERB_STONE = { width: 1.12, offset: 3.55 }
export const KERB_LINE = { width: 0.13, offset: 3.03 }

export function buildRoadRuns(bounds: SceneBounds) {
  const roadRuns: RoadRun[] = []
  for (const way of STREET_SURFACE_WAYS.roads) {
    const wayWidth = displayRoadWidth(way)
    const runs: [number, number][][] = []
    let run: [number, number][] = []
    const finishRun = () => {
      if (run.length > 1) runs.push(run)
      run = []
    }
    for (let i = 0; i < way.points.length - 1; i++) {
      const clipped = clipSegmentToBounds(streetMeters(way.points[i]), streetMeters(way.points[i + 1]), bounds)
      if (!clipped) { finishRun(); continue }
      const [[ax, az], [bx, bz]] = clipped
      if (Math.hypot(bx - ax, bz - az) < 0.35) continue
      if (run.length && Math.hypot(run[run.length - 1][0] - ax, run[run.length - 1][1] - az) > 0.1) finishRun()
      if (!run.length) run.push([ax, az])
      run.push([bx, bz])
    }
    finishRun()
    for (const points of runs) roadRuns.push({ points: clearRoadOfKeptBuildings(points, wayWidth), width: wayWidth, type: way.type, gaps: [] })
  }
  const photographedRun: RoadRun = { points: PHOTOGRAPHED_ROAD_POINTS, width: PHOTOGRAPHED_ROAD_WIDTH, type: 'photographed', gaps: [] }
  markRoadJunctions([...roadRuns, photographedRun])
  roadRuns.push(photographedRun)
  return { roadRuns, photographedGaps: photographedRun.gaps }
}

// OSM은 도로 중심선만 주므로, 고정 폭으로 그린 도로가 따로 그려진 건물 윤곽 아래로 번지지 않게 건물 자리(0.2m 여유)를 뺍니다.
export function buildingMasks(buildings: StreetBuilding[]): polygonClipping.Polygon[] {
  return buildings.map((building) => {
    const outline = building.outline.map(streetMeters)
    const cx = outline.reduce((sum, [x]) => sum + x, 0) / outline.length
    const cz = outline.reduce((sum, [, z]) => sum + z, 0) / outline.length
    const ring: polygonClipping.Ring = outline.map(([x, z]) => {
      const distance = Math.hypot(x - cx, z - cz) || 1
      return [x + (x - cx) / distance * 0.2, z + (z - cz) / distance * 0.2]
    })
    ring.push(ring[0])
    return [ring]
  })
}

// 중심선을 옆으로 offset만큼 옮긴 폭 width의 띠 조각들입니다(합치기 전).
export function ribbonPolygons(input: [number, number][], width: number, offset = 0): polygonClipping.Polygon[] {
  const points = input.filter((point, index) => index === 0 || Math.hypot(
    point[0] - input[index - 1][0], point[1] - input[index - 1][1],
  ) > 0.05)
  if (points.length < 2 || width <= 0) return []
  const normals = points.slice(1).map(([x, z], index) => {
    const [px, pz] = points[index]
    const length = Math.hypot(x - px, z - pz)
    return [(pz - z) / length, (x - px) / length] as [number, number]
  })
  const shifted = points.map(([x, z], index) => {
    const previous = normals[Math.max(0, index - 1)]
    const next = normals[Math.min(normals.length - 1, index)]
    let mx = previous[0] + next[0]
    let mz = previous[1] + next[1]
    const magnitude = Math.hypot(mx, mz)
    if (magnitude < 0.1) { mx = next[0]; mz = next[1] }
    else { mx /= magnitude; mz /= magnitude }
    const miter = Math.min(1.55, 1 / Math.max(0.2, mx * next[0] + mz * next[1]))
    return [x + mx * offset * miter, z + mz * offset * miter] as [number, number]
  })
  return roadOutlines([{ points: shifted, width, type: 'road', gaps: [] }])
}

function circle([x, z]: [number, number], radius: number): polygonClipping.Polygon {
  const ring: polygonClipping.Ring = []
  for (let step = 0; step <= 48; step++) {
    const angle = step / 48 * Math.PI * 2
    ring.push([x + Math.cos(angle) * radius, z + Math.sin(angle) * radius])
  }
  return [ring]
}

export function computeRoadGround(buildings: StreetBuilding[], bounds: SceneBounds): RoadGround {
  const { roadRuns, photographedGaps } = buildRoadRuns(bounds)
  const masks = buildingMasks(buildings)
  const clear = (polygons: polygonClipping.Polygon[]) => {
    if (!polygons.length) return []
    const area = unionRoadAreas(polygons)
    return masks.length ? polygonClipping.difference(area, ...masks) : area
  }
  const kerbPieces = roadPieces(PHOTOGRAPHED_ROAD_POINTS, photographedGaps)
  const kerb = ({ width, offset }: { width: number; offset: number }) => clear(kerbPieces.flatMap((piece) =>
    [-1, 1].flatMap((side) => ribbonPolygons(piece, width, offset * side))))
  // 차도와 골목길을 나눠 그립니다. 골목길은 roadOutlines가 footway를 건너뛰므로 종류 이름을 바꿔 넘깁니다.
  const vehicleRuns = roadRuns.filter((road) => !FOOT_ROAD_TYPES.has(road.type))
  const alleyRuns = roadRuns.filter((road) => FOOT_ROAD_TYPES.has(road.type)).map((road) => ({ ...road, type: 'foot' }))
  return {
    // 차도 면 하나로 합쳐 교차로가 끊김 없는 한 윤곽이 되게 합니다. 그보다 조금 넓은 돌 포장이 아래에 깔려
    // 차도와 골목길 가장자리에서만 보입니다.
    roads: clear(roadOutlines(vehicleRuns)),
    outer: clear([...roadOutlines(vehicleRuns, true), ...roadOutlines(alleyRuns.map((road) => ({ ...road, width: road.width + ALLEY_EDGE })))]),
    footways: clear(roadOutlines(alleyRuns)),
    kerbStone: kerb(KERB_STONE),
    kerbLine: kerb(KERB_LINE),
    meeting: clear([circle(streetMeters(MEETING_CIRCLE_CENTER), MEETING_CIRCLE_RADIUS)]),
  }
}

// 저장본 크기를 줄이려고 좌표를 1cm 단위로 반올림합니다.
export function roundRoadGround(ground: RoadGround): RoadGround {
  const round = (area: polygonClipping.MultiPolygon) => area.map((polygon) => polygon.map((ring) =>
    ring.map(([x, z]) => [Math.round(x * 100) / 100, Math.round(z * 100) / 100] as [number, number])))
  return Object.fromEntries(Object.entries(ground).map(([key, area]) => [key, round(area)])) as unknown as RoadGround
}

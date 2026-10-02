import { distanceToSegment } from './planGeometry'
import { clearRoadOfKeptBuildings, PHOTOGRAPHED_STREET, streetMeters } from './streetSceneData'
import { PHOTOGRAPHED_ROAD_WIDTH } from './roadCorridors'
import { STREET_SURFACE_WAYS } from './streetSurfaceData'
import type { RoadRun } from './roadCorridors'

export { roadOutlines, unionRoadAreas } from './roadCorridors'
export type { RoadRun } from './roadCorridors'

// 거리 장면의 도로 중심선을 면으로 바꾸는 순수 계산입니다. 좌표는 모두 장면 기준 미터(동, 남)입니다.

const ROAD_SEGMENTS = STREET_SURFACE_WAYS.roads.flatMap((way) => way.points.slice(1).map((point, index) => [
  streetMeters(way.points[index]), streetMeters(point),
] as [[number, number], [number, number]]))


// 촬영 거리 끝(갈림길)은 분홍 주택 벽을 피하도록 보정한 중심선을 씁니다(clearRoadOfKeptBuildings).
export const PHOTOGRAPHED_ROAD_POINTS = clearRoadOfKeptBuildings(PHOTOGRAPHED_STREET.map(streetMeters), PHOTOGRAPHED_ROAD_WIDTH)

function segmentCrossing(a: [number, number], b: [number, number], c: [number, number], d: [number, number]) {
  const ax = b[0] - a[0], az = b[1] - a[1]
  const bx = d[0] - c[0], bz = d[1] - c[1]
  const cross = ax * bz - az * bx
  const lengths = Math.hypot(ax, az) * Math.hypot(bx, bz)
  if (lengths < 0.01 || Math.abs(cross) / lengths < 0.32) return null
  const cx = c[0] - a[0], cz = c[1] - a[1]
  const t = (cx * bz - cz * bx) / cross
  const u = (cx * az - cz * ax) / cross
  return t >= -0.02 && t <= 1.02 && u >= -0.02 && u <= 1.02
    ? [Math.max(0, Math.min(1, t)), Math.max(0, Math.min(1, u))] as const : null
}

function roadLengths(points: [number, number][]) {
  const distances = [0]
  for (let i = 1; i < points.length; i++) {
    distances.push(distances[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]))
  }
  return distances
}

export function roadPieces(points: [number, number][], gaps: [number, number][]) {
  if (points.length < 2) return []
  if (!gaps.length) return [points]
  const distances = roadLengths(points)
  const total = distances[distances.length - 1]
  const intervals = gaps.map(([start, end]) => [Math.max(0, start), Math.min(total, end)] as [number, number])
    .filter(([start, end]) => end > start).sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const [start, end] of intervals) {
    const last = merged[merged.length - 1]
    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else merged.push([start, end])
  }
  const at = (distance: number): [number, number] => {
    let index = 1
    while (index < distances.length - 1 && distances[index] < distance) index++
    const segment = Math.max(0.001, distances[index] - distances[index - 1])
    const t = (distance - distances[index - 1]) / segment
    return [points[index - 1][0] + (points[index][0] - points[index - 1][0]) * t,
      points[index - 1][1] + (points[index][1] - points[index - 1][1]) * t]
  }
  const output: [number, number][][] = []
  const add = (start: number, end: number) => {
    if (end - start < 0.35) return
    const piece: [number, number][] = [at(start)]
    for (let index = 1; index < points.length - 1; index++) {
      if (distances[index] > start && distances[index] < end) piece.push(points[index])
    }
    piece.push(at(end))
    output.push(piece)
  }
  let start = 0
  for (const [gapStart, gapEnd] of merged) { add(start, gapStart); start = Math.max(start, gapEnd) }
  add(start, total)
  return output
}

export function markRoadJunctions(runs: RoadRun[]) {
  const lengths = runs.map((run) => roadLengths(run.points))
  for (let a = 0; a < runs.length; a++) for (let b = a + 1; b < runs.length; b++) {
    const first = runs[a], second = runs[b]
    for (let i = 0; i < first.points.length - 1; i++) for (let j = 0; j < second.points.length - 1; j++) {
      const crossing = segmentCrossing(first.points[i], first.points[i + 1], second.points[j], second.points[j + 1])
      if (!crossing) continue
      const firstAt = lengths[a][i] + crossing[0] * (lengths[a][i + 1] - lengths[a][i])
      const secondAt = lengths[b][j] + crossing[1] * (lengths[b][j + 1] - lengths[b][j])
      const ax = first.points[i + 1][0] - first.points[i][0]
      const az = first.points[i + 1][1] - first.points[i][1]
      const bx = second.points[j + 1][0] - second.points[j][0]
      const bz = second.points[j + 1][1] - second.points[j][1]
      const sine = Math.max(0.32, Math.abs(ax * bz - az * bx) / (Math.hypot(ax, az) * Math.hypot(bx, bz)))
      const firstRadius = (second.width / 2 + 0.8) / sine
      const secondRadius = (first.width / 2 + 0.8) / sine
      first.gaps.push([firstAt - firstRadius, firstAt + firstRadius])
      second.gaps.push([secondAt - secondRadius, secondAt + secondRadius])
    }
  }
}

export function distanceToRoad(x: number, z: number) {
  let closest = Infinity
  for (const [start, end] of ROAD_SEGMENTS) {
    // 0.1m보다 짧은 조각은 방향이 불안정해 건너뜁니다.
    if ((end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2 < 0.01) continue
    closest = Math.min(closest, distanceToSegment(x, z, start, end))
  }
  return closest
}

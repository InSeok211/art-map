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

// 도로 조각을 넣어 둔 격자(한 칸 20m). 건물 1,270동의 변마다 가장 가까운 길을 찾는데, 조각을 매번 다 보면 3D 거리 빌드
// 시간의 1/3이 여기에 들었습니다. 점이 든 칸부터 바깥 고리로 넓혀 보다가, 남은 고리가 지금 찾은 거리보다 멀면 멈춥니다.
const ROAD_GRID_METERS = 20
let roadGrid: { cells: globalThis.Map<string, number[]>; segments: [[number, number], [number, number]][]; maxRing: number } | null = null

function buildRoadGrid() {
  const cells = new globalThis.Map<string, number[]>()
  // 0.1m보다 짧은 조각은 방향이 불안정해 건너뜁니다.
  const segments = ROAD_SEGMENTS.filter(([start, end]) => (end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2 >= 0.01)
  let minCol = Infinity, maxCol = -Infinity, minRow = Infinity, maxRow = -Infinity
  segments.forEach(([start, end], index) => {
    const col0 = Math.floor(Math.min(start[0], end[0]) / ROAD_GRID_METERS), col1 = Math.floor(Math.max(start[0], end[0]) / ROAD_GRID_METERS)
    const row0 = Math.floor(Math.min(start[1], end[1]) / ROAD_GRID_METERS), row1 = Math.floor(Math.max(start[1], end[1]) / ROAD_GRID_METERS)
    for (let col = col0; col <= col1; col++) for (let row = row0; row <= row1; row++) {
      const key = `${col},${row}`
      const bucket = cells.get(key)
      if (bucket) bucket.push(index)
      else cells.set(key, [index])
    }
    minCol = Math.min(minCol, col0); maxCol = Math.max(maxCol, col1)
    minRow = Math.min(minRow, row0); maxRow = Math.max(maxRow, row1)
  })
  // 격자 전체를 덮는 고리 수(이보다 바깥에는 조각이 없음)
  const maxRing = segments.length ? Math.max(maxCol - minCol, maxRow - minRow) + 1 : 0
  return { cells, segments, maxRing }
}

export function distanceToRoad(x: number, z: number) {
  const grid = roadGrid ??= buildRoadGrid()
  const col = Math.floor(x / ROAD_GRID_METERS), row = Math.floor(z / ROAD_GRID_METERS)
  let closest = Infinity
  // 점은 자기 칸 안 어딘가에 있으므로, 고리 r의 칸에 든 조각은 적어도 (r-1)×20m보다 멉니다.
  // 고리 r까지 본 뒤 찾은 거리가 r×20m 이하이면 더 바깥 고리는 볼 필요가 없습니다.
  for (let ring = 0; ring <= grid.maxRing; ring++) {
    for (let dc = -ring; dc <= ring; dc++) for (let dr = -ring; dr <= ring; dr++) {
      if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue
      const bucket = grid.cells.get(`${col + dc},${row + dr}`)
      if (!bucket) continue
      for (const index of bucket) {
        const [start, end] = grid.segments[index]
        closest = Math.min(closest, distanceToSegment(x, z, start, end))
      }
    }
    if (closest <= ring * ROAD_GRID_METERS) break
  }
  return closest
}

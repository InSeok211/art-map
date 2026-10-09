import type { LngLat } from './alleys'

// 관리자가 걸으며 남긴 GPS 기록으로 지도에 없는 골목길을 찾습니다.
//
//  1. 기록 다듬기: 정확도가 나쁜 점(20m 초과)과 순간적으로 튄 점을 버리고, 오래 끊긴 곳에서 나눕니다.
//  2. 칸 세기: 지도를 2.5m 칸으로 나눠, 칸마다 그곳을 지나간 "서로 다른 기록"의 수를 셉니다. 같은 기록 안에서
//     여러 번 오간 것은 한 번으로 칩니다. GPS가 매번 몇 m씩 어긋나므로 지나간 칸의 이웃 칸까지 함께 셉니다.
//  3. 후보 고르기: 기준 횟수 이상 지나갔지만 이미 있는 도로·골목길(또는 버린 후보) 위가 아닌 칸을 이어 덩어리로
//     묶고, 덩어리마다 가장 긴 줄기(갈래가 있으면 갈래도)를 선으로 뽑습니다.
//  4. 가운데 잡기: 선의 각 점을 그 근처를 지나간 실제 기록 점들의 평균으로 옮겨 GPS 오차를 줄이고, 끝이 도로
//     가까이에서 멈추면 도로 중심선까지 이어 줍니다.

// [경도, 위도, 정확도(m), 시각(ms)]
export type TrailPoint = [number, number, number, number]

export interface GpsTrail {
  id: string
  startedAt: string
  points: TrailPoint[]
}

export interface AlleyCandidate {
  id: string
  coordinates: LngLat[]
  passes: number // 이 길을 지나간 서로 다른 기록 수(길을 따라 센 값의 중앙값)
  lengthMeters: number
}

// 이미 있는 길(중심선과 폭). 이 근처의 흔적은 새 골목길로 보지 않습니다.
export interface KnownWay {
  points: LngLat[]
  width: number
}

export const TRAIL_ACCURACY_LIMIT = 20
export const PASS_THRESHOLD_RANGE = { min: 2, max: 10, default: 3 } as const
const CELL = 2.5
const SAMPLE_STEP = 0.5
const MAX_GAP_MS = 60_000
const MAX_SPEED = 4 // m/s, 걷는 속도보다 넉넉히
const KNOWN_MARGIN = 2.5 // 이미 있는 길 가장자리에서 이만큼까지는 그 길을 걸은 것으로 봅니다(m)
const MIN_CELLS = 5
const CENTER_RADIUS = 4
const SNAP_DISTANCE = 6

const ORIGIN: LngLat = [129.0089, 35.0949]
const M_LAT = 111_320
const M_LON = M_LAT * Math.cos(ORIGIN[1] * Math.PI / 180)
type XZ = [number, number]
const toXZ = ([lng, lat]: LngLat | TrailPoint): XZ => [(lng - ORIGIN[0]) * M_LON, (ORIGIN[1] - lat) * M_LAT]
const toLngLat = ([x, z]: XZ): LngLat => [
  Math.round((ORIGIN[0] + x / M_LON) * 1e7) / 1e7,
  Math.round((ORIGIN[1] - z / M_LAT) * 1e7) / 1e7,
]

const isTrailPoint = (value: unknown): value is TrailPoint =>
  Array.isArray(value) && value.length === 4 && value.every((part) => Number.isFinite(part))

export function sanitizeTrails(value: unknown): GpsTrail[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const trail = item as Partial<GpsTrail> | null
    if (!trail || typeof trail.id !== 'string' || typeof trail.startedAt !== 'string' || !Array.isArray(trail.points)) return []
    const points = trail.points.filter(isTrailPoint)
    return points.length ? [{ id: trail.id, startedAt: trail.startedAt, points }] : []
  })
}

// 1. 기록을 믿을 만한 조각(장면 미터 좌표)들로 다듬습니다.
export function cleanTrail(points: TrailPoint[]): XZ[][] {
  const pieces: XZ[][] = []
  let piece: XZ[] = []
  let last: { xz: XZ; time: number } | null = null
  let rejected = 0
  const finish = () => {
    if (piece.length > 1) pieces.push(piece)
    piece = []
  }
  for (const point of points) {
    if (point[2] > TRAIL_ACCURACY_LIMIT) continue
    const xz = toXZ(point)
    if (last) {
      const seconds = (point[3] - last.time) / 1000
      const distance = Math.hypot(xz[0] - last.xz[0], xz[1] - last.xz[1])
      if (seconds * 1000 > MAX_GAP_MS || seconds < 0) finish()
      // 걷는 속도로는 갈 수 없는 거리로 튄 점은 버립니다. 세 번 연달아 튀면 정말 옮겨 간 것으로 보고 새로 시작합니다.
      else if (distance > 8 && distance / Math.max(seconds, 0.5) > MAX_SPEED && rejected < 3) {
        rejected++
        continue
      } else if (rejected >= 3) finish()
    }
    rejected = 0
    piece.push(xz)
    last = { xz, time: point[3] }
  }
  finish()
  return pieces
}

const cellKey = (cx: number, cz: number) => `${cx},${cz}`
const cellOf = ([x, z]: XZ) => [Math.floor(x / CELL), Math.floor(z / CELL)] as const
const cellCenter = (cx: number, cz: number): XZ => [(cx + 0.5) * CELL, (cz + 0.5) * CELL]
const parseKey = (key: string) => key.split(',').map(Number) as [number, number]

function samplePiece(piece: XZ[], visit: (point: XZ) => void) {
  visit(piece[0])
  for (let index = 1; index < piece.length; index++) {
    const [ax, az] = piece[index - 1], [bx, bz] = piece[index]
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / SAMPLE_STEP)
    for (let step = 1; step <= steps; step++) visit([ax + (bx - ax) * step / steps, az + (bz - az) * step / steps])
  }
}

function distanceToSegment([px, pz]: XZ, [ax, az]: XZ, [bx, bz]: XZ) {
  const dx = bx - ax, dz = bz - az
  const length = dx * dx + dz * dz
  const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / length)) : 0
  return { distance: Math.hypot(px - ax - dx * t, pz - az - dz * t), point: [ax + dx * t, az + dz * t] as XZ }
}

// 이미 있는 길의 선분을 10m 칸에 나눠 담아, 가까운 길을 빠르게 찾습니다.
class WayIndex {
  private buckets = new Map<string, { a: XZ; b: XZ; reach: number; half: number }[]>()
  constructor(ways: { points: XZ[]; half: number; margin: number }[]) {
    for (const { points, half, margin } of ways) {
      for (let index = 1; index < points.length; index++) {
        const a = points[index - 1], b = points[index]
        const segment = { a, b, reach: half + margin, half }
        const pad = segment.reach + SNAP_DISTANCE
        for (let x = Math.floor((Math.min(a[0], b[0]) - pad) / 10); x <= Math.floor((Math.max(a[0], b[0]) + pad) / 10); x++) {
          for (let z = Math.floor((Math.min(a[1], b[1]) - pad) / 10); z <= Math.floor((Math.max(a[1], b[1]) + pad) / 10); z++) {
            const key = cellKey(x, z)
            const bucket = this.buckets.get(key)
            if (bucket) bucket.push(segment)
            else this.buckets.set(key, [segment])
          }
        }
      }
    }
  }

  private near(point: XZ) {
    return this.buckets.get(cellKey(Math.floor(point[0] / 10), Math.floor(point[1] / 10))) ?? []
  }

  covers(point: XZ) {
    return this.near(point).some(({ a, b, reach }) => distanceToSegment(point, a, b).distance < reach)
  }

  // 길 가장자리에서 SNAP_DISTANCE 안에 있는 가장 가까운 중심선 위의 점
  snap(point: XZ): XZ | null {
    let best: { distance: number; point: XZ } | null = null
    for (const { a, b, half } of this.near(point)) {
      const hit = distanceToSegment(point, a, b)
      if (hit.distance - half < SNAP_DISTANCE && (!best || hit.distance < best.distance)) best = hit
    }
    return best?.point ?? null
  }
}

function neighbours(cx: number, cz: number) {
  const result: [number, number][] = []
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (dx || dz) result.push([cx + dx, cz + dz])
  return result
}

// 덩어리 안에서 start부터 칸 사이 걸음 수로 가장 먼 칸과, 거기까지의 경로를 찾습니다.
function farthest(cells: Set<string>, start: string) {
  const parent = new Map<string, string | null>([[start, null]])
  const queue = [start]
  let last = start
  for (let head = 0; head < queue.length; head++) {
    const key = queue[head]
    last = key
    for (const [nx, nz] of neighbours(...parseKey(key))) {
      const next = cellKey(nx, nz)
      if (cells.has(next) && !parent.has(next)) {
        parent.set(next, key)
        queue.push(next)
      }
    }
  }
  const path: string[] = []
  for (let key: string | null | undefined = last; key; key = parent.get(key)) path.push(key)
  return path.reverse()
}

function components(cells: Set<string>) {
  const seen = new Set<string>()
  const groups: Set<string>[] = []
  for (const start of cells) {
    if (seen.has(start)) continue
    const group = new Set<string>([start])
    seen.add(start)
    const stack = [start]
    while (stack.length) {
      for (const [nx, nz] of neighbours(...parseKey(stack.pop()!))) {
        const next = cellKey(nx, nz)
        if (cells.has(next) && !seen.has(next)) {
          seen.add(next)
          group.add(next)
          stack.push(next)
        }
      }
    }
    groups.push(group)
  }
  return groups
}

function simplify(points: XZ[], tolerance: number): XZ[] {
  if (points.length < 3) return points
  let worst = 0, index = 0
  for (let i = 1; i < points.length - 1; i++) {
    const { distance } = distanceToSegment(points[i], points[0], points[points.length - 1])
    if (distance > worst) { worst = distance; index = i }
  }
  if (worst <= tolerance) return [points[0], points[points.length - 1]]
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)]
}

const lengthOf = (points: XZ[]) => points.slice(1).reduce((sum, [x, z], index) => sum + Math.hypot(x - points[index][0], z - points[index][1]), 0)

export function findAlleyCandidates(
  trails: GpsTrail[],
  options: { threshold: number; known: KnownWay[]; dismissed?: LngLat[][] },
): AlleyCandidate[] {
  // 2. 칸마다 지나간 서로 다른 기록 수를 셉니다. 실제 기록 점은 가운데 잡기에 쓰려고 칸별로 모아 둡니다.
  const counts = new Map<string, number>()
  const samples = new Map<string, XZ[]>()
  for (const trail of trails) {
    const touched = new Set<string>()
    for (const piece of cleanTrail(trail.points)) {
      samplePiece(piece, (point) => {
        const [cx, cz] = cellOf(point)
        const key = cellKey(cx, cz)
        const bucket = samples.get(key)
        if (bucket) bucket.push(point)
        else samples.set(key, [point])
        touched.add(key)
        for (const [nx, nz] of neighbours(cx, cz)) touched.add(cellKey(nx, nz))
      })
    }
    for (const key of touched) counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  // 3. 기준 이상 지나갔고 이미 있는 길·버린 후보 위가 아닌 칸만 남깁니다.
  const known = new WayIndex(options.known.map((way) => ({ points: way.points.map(toXZ), half: way.width / 2, margin: KNOWN_MARGIN })))
  const dismissed = new WayIndex((options.dismissed ?? []).map((line) => ({ points: line.map(toXZ), half: 0, margin: CENTER_RADIUS })))
  const cells = new Set<string>()
  for (const [key, count] of counts) {
    if (count < options.threshold) continue
    const center = cellCenter(...parseKey(key))
    if (!known.covers(center) && !dismissed.covers(center)) cells.add(key)
  }

  const candidates: AlleyCandidate[] = []
  const pending = components(cells).filter((group) => group.size >= MIN_CELLS)
  while (pending.length) {
    const group = pending.pop()!
    const start = farthest(group, group.values().next().value!).at(-1)!
    const path = farthest(group, start)
    // 줄기에서 두 칸 안의 칸은 이 줄기에 속한 것으로 보고, 나머지(갈래)는 따로 다시 찾습니다.
    const onPath = new Set(path)
    const rest = new Set([...group].filter((key) => {
      const [cx, cz] = parseKey(key)
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (onPath.has(cellKey(cx + dx, cz + dz))) return false
      return true
    }))
    pending.push(...components(rest).filter((branch) => branch.size >= MIN_CELLS))

    // 4. 줄기의 칸마다 근처를 지나간 실제 기록 점의 평균으로 옮깁니다.
    const centred = path.map((key): XZ => {
      const [cx, cz] = parseKey(key)
      const center = cellCenter(cx, cz)
      let sx = 0, sz = 0, n = 0
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        for (const point of samples.get(cellKey(cx + dx, cz + dz)) ?? []) {
          if (Math.hypot(point[0] - center[0], point[1] - center[1]) > CENTER_RADIUS) continue
          sx += point[0]; sz += point[1]; n++
        }
      }
      return n ? [sx / n, sz / n] : center
    })
    let line = simplify(centred, 0.8)
    const head = known.snap(line[0]), tail = known.snap(line[line.length - 1])
    if (head) line = [head, ...line]
    if (tail) line = [...line, tail]
    const lengthMeters = lengthOf(line)
    if (lengthMeters < 8) continue
    const pathCounts = path.map((key) => counts.get(key) ?? 0).sort((a, b) => a - b)
    const coordinates = line.map(toLngLat)
    candidates.push({
      id: `candidate-${coordinates[0].join('_')}-${coordinates[coordinates.length - 1].join('_')}`,
      coordinates,
      passes: pathCounts[Math.floor(pathCounts.length / 2)],
      lengthMeters,
    })
  }
  return candidates.sort((a, b) => b.passes - a.passes || b.lengthMeters - a.lengthMeters)
}

export function trailsToGeoJSON(trails: GpsTrail[]) {
  return {
    type: 'FeatureCollection' as const,
    features: trails.flatMap((trail) => cleanTrail(trail.points).map((piece) => ({
      type: 'Feature' as const,
      properties: { id: trail.id },
      geometry: { type: 'LineString' as const, coordinates: piece.map(toLngLat) },
    }))),
  }
}

export function candidatesToGeoJSON(candidates: AlleyCandidate[], selectedId: string | null) {
  return {
    type: 'FeatureCollection' as const,
    features: candidates.map((candidate) => ({
      type: 'Feature' as const,
      properties: { id: candidate.id, passes: candidate.passes, selected: candidate.id === selectedId },
      geometry: { type: 'LineString' as const, coordinates: candidate.coordinates },
    })),
  }
}

export function trailLengthMeters(trail: GpsTrail) {
  return cleanTrail(trail.points).reduce((sum, piece) => sum + lengthOf(piece), 0)
}

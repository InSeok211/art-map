import type { Alley, LngLat } from './alleys'
import { isInsideGamcheonMap } from './gamcheonBoundary'
import { streetMeters } from './streetSceneData'
import { STREET_SURFACE_WAYS } from './streetSurfaceData'

// 걸어서 가는 길찾기입니다. OSM 도로·골목·보도·계단 중심선(src/street-surfaces.json)과 사용자가 그린 골목길로
// 보행 그물망을 만들고 A* 탐색으로 가장 빠른 길을 찾습니다. 화면용으로 위치를 보정한 도로(clearRoadOfKeptBuildings)가
// 아니라 OSM 원본 중심선을 씁니다. 고도 자료가 없어 경사는 반영하지 못하고, 계단만 따로 느리게 셈합니다.

export type EdgeKind = 'road' | 'steps' | 'alley' | 'connector'
interface Edge { to: number; length: number; kind: EdgeKind }

export interface WalkGraph {
  points: LngLat[]
  meters: [number, number][]
  edges: Edge[][]
}

export interface RouteStep {
  action: 'start' | 'straight' | 'left' | 'right' | 'slight-left' | 'slight-right' | 'back' | 'steps' | 'arrive'
  text: string
  distance: number // 이 안내부터 다음 안내까지 걷는 거리(m)
}

export interface Route {
  coordinates: LngLat[]
  distance: number // m
  duration: number // 초
  stairsDistance: number // 계단 구간 길이(m)
  steps: RouteStep[]
}

export interface RouteOptions { avoidStairs?: boolean }

// 평지 보행 속도(감천동은 비탈이 많아 평균보다 조금 느리게 잡음)와 계단 보행 속도(수평 거리 기준)
export const WALKING_SPEED = 1.1
export const STAIRS_SPEED = 0.55
// 출발·도착점을 길에 붙일 수 있는 최대 거리(m)
export const MAX_SNAP_DISTANCE = 80
// 사용자가 그린 골목길 끝점을 기존 길에 잇는 최대 거리(m)
const ALLEY_LINK_DISTANCE = 12

const EXCLUDED_TYPES = new Set(['motorway', 'motorway_link'])

function distance(a: [number, number], b: [number, number]) {
  return Math.hypot(b[0] - a[0], b[1] - a[1])
}

export function buildWalkGraph(alleys: Alley[] = []): WalkGraph {
  const graph: WalkGraph = { points: [], meters: [], edges: [] }
  const index = new Map<string, number>()
  const nodeAt = (point: LngLat) => {
    // 같은 OSM 노드를 쓰는 길끼리는 좌표가 같아 그 자리에서 이어집니다.
    const key = `${point[0].toFixed(7)},${point[1].toFixed(7)}`
    let id = index.get(key)
    if (id === undefined) {
      id = graph.points.length
      index.set(key, id)
      graph.points.push(point)
      graph.meters.push(streetMeters(point))
      graph.edges.push([])
    }
    return id
  }
  const link = (a: number, b: number, kind: EdgeKind) => {
    if (a === b) return
    const length = distance(graph.meters[a], graph.meters[b])
    graph.edges[a].push({ to: b, length, kind })
    graph.edges[b].push({ to: a, length, kind })
  }
  for (const way of STREET_SURFACE_WAYS.roads) {
    if (EXCLUDED_TYPES.has(way.type)) continue
    if (!way.points.some(([longitude, latitude]) => isInsideGamcheonMap(longitude, latitude))) continue
    const kind: EdgeKind = way.type === 'steps' ? 'steps' : 'road'
    for (let i = 1; i < way.points.length; i++) link(nodeAt(way.points[i - 1]), nodeAt(way.points[i]), kind)
  }
  const roadNodeCount = graph.points.length
  for (const alley of alleys) {
    const ids = alley.coordinates.map(nodeAt)
    for (let i = 1; i < ids.length; i++) link(ids[i - 1], ids[i], 'alley')
    // 골목길 끝점은 가까운 기존 길 꼭짓점에 잇습니다.
    for (const id of [ids[0], ids[ids.length - 1]]) {
      let best = -1, bestDistance = ALLEY_LINK_DISTANCE
      for (let other = 0; other < roadNodeCount; other++) {
        const current = distance(graph.meters[id], graph.meters[other])
        if (current < bestDistance) { best = other; bestDistance = current }
      }
      if (best >= 0) link(id, best, 'connector')
    }
  }
  return graph
}

// 점에서 가장 가까운 길 위의 지점(선분 위 투영점)입니다.
export interface Snap { from: number; to: number; t: number; distance: number; kind: EdgeKind }

export function snapToGraph(graph: WalkGraph, point: LngLat, avoidStairs = false): Snap | null {
  const target = streetMeters(point)
  let best: Snap | null = null
  for (let from = 0; from < graph.edges.length; from++) {
    for (const edge of graph.edges[from]) {
      if (edge.to < from || (avoidStairs && edge.kind === 'steps')) continue
      const a = graph.meters[from], b = graph.meters[edge.to]
      const dx = b[0] - a[0], dz = b[1] - a[1]
      const lengthSquared = dx * dx + dz * dz
      const t = lengthSquared ? Math.max(0, Math.min(1, ((target[0] - a[0]) * dx + (target[1] - a[1]) * dz) / lengthSquared)) : 0
      const current = Math.hypot(target[0] - a[0] - dx * t, target[1] - a[1] - dz * t)
      if (!best || current < best.distance) best = { from, to: edge.to, t, distance: current, kind: edge.kind }
    }
  }
  return best
}

function edgeCost(edge: Edge, avoidStairs: boolean) {
  if (edge.kind === 'steps') return avoidStairs ? Infinity : edge.length * WALKING_SPEED / STAIRS_SPEED
  return edge.length
}

class MinHeap {
  private items: [number, number][] = []
  get size() { return this.items.length }
  push(item: [number, number]) {
    const items = this.items
    items.push(item)
    let index = items.length - 1
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (items[parent][0] <= items[index][0]) break
      ;[items[parent], items[index]] = [items[index], items[parent]]
      index = parent
    }
  }
  pop() {
    const items = this.items
    const top = items[0]
    const last = items.pop()!
    if (items.length) {
      items[0] = last
      let index = 0
      for (;;) {
        const left = index * 2 + 1, right = left + 1
        let smallest = index
        if (left < items.length && items[left][0] < items[smallest][0]) smallest = left
        if (right < items.length && items[right][0] < items[smallest][0]) smallest = right
        if (smallest === index) break
        ;[items[smallest], items[index]] = [items[index], items[smallest]]
        index = smallest
      }
    }
    return top
  }
}

export type RouteError = 'origin-off-network' | 'destination-off-network' | 'no-route'

export function findRoute(graph: WalkGraph, origin: LngLat, destination: LngLat, options: RouteOptions = {}): Route | RouteError {
  const avoidStairs = options.avoidStairs ?? false
  const start = snapToGraph(graph, origin, avoidStairs)
  if (!start || start.distance > MAX_SNAP_DISTANCE) return 'origin-off-network'
  const end = snapToGraph(graph, destination, avoidStairs)
  if (!end || end.distance > MAX_SNAP_DISTANCE) return 'destination-off-network'

  // 출발·도착 투영점을 임시 꼭짓점으로 넣어 탐색합니다(원본 그물망은 바꾸지 않음).
  const startId = graph.points.length, endId = startId + 1
  const meters = (id: number) => id === startId ? lerp(graph.meters[start.from], graph.meters[start.to], start.t)
    : id === endId ? lerp(graph.meters[end.from], graph.meters[end.to], end.t) : graph.meters[id]
  const extra = new Map<number, Edge[]>()
  const addExtra = (a: number, b: number, length: number, kind: EdgeKind) => {
    if (!extra.has(a)) extra.set(a, [])
    if (!extra.has(b)) extra.set(b, [])
    extra.get(a)!.push({ to: b, length, kind })
    extra.get(b)!.push({ to: a, length, kind })
  }
  for (const [id, snap] of [[startId, start], [endId, end]] as const) {
    const total = distance(graph.meters[snap.from], graph.meters[snap.to])
    addExtra(id, snap.from, total * snap.t, snap.kind)
    addExtra(id, snap.to, total * (1 - snap.t), snap.kind)
  }
  // 출발과 도착이 같은 선분 위에 있으면 바로 잇습니다.
  if ((start.from === end.from && start.to === end.to) || (start.from === end.to && start.to === end.from)) {
    addExtra(startId, endId, distance(meters(startId), meters(endId)), start.kind)
  }
  const neighbours = (id: number) => [...(graph.edges[id] ?? []), ...(extra.get(id) ?? [])]

  const goal = meters(endId)
  const best = new Map<number, number>([[startId, 0]])
  const previous = new Map<number, { from: number; edge: Edge }>()
  const heap = new MinHeap()
  heap.push([distance(meters(startId), goal), startId])
  const done = new Set<number>()
  while (heap.size) {
    const [, current] = heap.pop()
    if (done.has(current)) continue
    done.add(current)
    if (current === endId) break
    for (const edge of neighbours(current)) {
      const cost = edgeCost(edge, avoidStairs)
      if (!Number.isFinite(cost)) continue
      const next = best.get(current)! + cost
      if (next < (best.get(edge.to) ?? Infinity)) {
        best.set(edge.to, next)
        previous.set(edge.to, { from: current, edge })
        heap.push([next + distance(meters(edge.to), goal), edge.to])
      }
    }
  }
  if (!done.has(endId)) return 'no-route'

  // 도착점에서 거꾸로 따라가며 경로를 만듭니다.
  const path: { id: number; edge?: Edge }[] = [{ id: endId }]
  for (let id = endId; id !== startId;) {
    const step = previous.get(id)!
    path[0].edge = step.edge
    path.unshift({ id: step.from })
    id = step.from
  }
  const pointOf = (id: number): LngLat => id === startId ? lerpPoint(graph.points[start.from], graph.points[start.to], start.t)
    : id === endId ? lerpPoint(graph.points[end.from], graph.points[end.to], end.t) : graph.points[id]
  // 각 구간: 시작 꼭짓점, 끝 꼭짓점, 종류
  const legs = path.slice(1).map((node, index) => ({ from: path[index].id, to: node.id, edge: node.edge! }))
  const coordinates = [origin, ...path.map(({ id }) => pointOf(id)), destination]
  const walkOn = distance(streetMeters(origin), meters(startId)) + distance(streetMeters(destination), meters(endId))
  const stairsDistance = legs.filter(({ edge }) => edge.kind === 'steps').reduce((sum, { edge }) => sum + edge.length, 0)
  const total = legs.reduce((sum, { edge }) => sum + edge.length, 0) + walkOn
  return {
    coordinates: coordinates.filter((point, index) => index === 0
      || distance(streetMeters(point), streetMeters(coordinates[index - 1])) > 0.3),
    distance: total,
    duration: (total - stairsDistance) / WALKING_SPEED + stairsDistance / STAIRS_SPEED,
    stairsDistance,
    steps: describeRoute(legs.map(({ from, to, edge }) => ({ a: meters(from), b: meters(to), edge, junction: degree(graph, to) >= 3 }))),
  }
}

function degree(graph: WalkGraph, id: number) {
  return graph.edges[id]?.length ?? 0
}

function lerp(a: [number, number], b: [number, number], t: number): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

function lerpPoint(a: LngLat, b: LngLat, t: number): LngLat {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

// 장면 좌표(동, 남)의 방향을 북쪽 기준 시계 방향 각도(도)로 바꿉니다.
function bearing(a: [number, number], b: [number, number]) {
  return (Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180 / Math.PI + 360) % 360
}

const COMPASS = ['북쪽', '북동쪽', '동쪽', '남동쪽', '남쪽', '남서쪽', '서쪽', '북서쪽']

const TURN_TEXT: Record<Exclude<RouteStep['action'], 'start' | 'straight' | 'steps' | 'arrive'>, string> = {
  left: '왼쪽으로 꺾어', right: '오른쪽으로 꺾어', 'slight-left': '왼쪽으로 살짝 꺾어',
  'slight-right': '오른쪽으로 살짝 꺾어', back: '뒤로 돌아',
}

function formatMeters(value: number) {
  return `${Math.max(1, Math.round(value / 5) * 5)}m`
}

// 길을 따라가며 갈림길에서 방향이 크게 바뀌는 곳과 계단이 시작되는 곳에서 안내를 나눕니다.
function describeRoute(legs: { a: [number, number]; b: [number, number]; edge: Edge; junction: boolean }[]): RouteStep[] {
  const parts = legs.filter(({ a, b }) => distance(a, b) > 0.2)
  if (!parts.length) return [{ action: 'arrive', text: '바로 앞이 목적지입니다.', distance: 0 }]
  const steps: RouteStep[] = []
  let current: RouteStep = { action: 'start', text: '', distance: 0 }
  let startBearing = bearing(parts[0].a, parts[0].b)
  let stairs = parts[0].edge.kind === 'steps'
  const close = () => {
    const along = formatMeters(current.distance)
    if (current.action === 'start') current.text = `${COMPASS[Math.round(startBearing / 45) % 8]}으로 ${along} 걸어가세요.`
    else if (current.action === 'steps') current.text = `계단으로 ${along} 이동하세요.`
    else if (current.action === 'straight') current.text = `그대로 ${along} 더 가세요.`
    else current.text = `${TURN_TEXT[current.action as keyof typeof TURN_TEXT]} ${along} 걸어가세요.`
    if (stairs && current.action !== 'steps') current.text += ' (계단 포함)'
    steps.push(current)
  }
  parts.forEach((part, index) => {
    if (index > 0) {
      const previous = parts[index - 1]
      const turn = ((bearing(part.a, part.b) - bearing(previous.a, previous.b) + 540) % 360) - 180
      const stairsStart = part.edge.kind === 'steps' && previous.edge.kind !== 'steps'
      const stairsEnd = part.edge.kind !== 'steps' && previous.edge.kind === 'steps'
      const action: RouteStep['action'] | null = Math.abs(turn) > 150 ? 'back'
        : Math.abs(turn) > 55 && previous.junction ? (turn < 0 ? 'left' : 'right')
          : Math.abs(turn) > 30 && previous.junction ? (turn < 0 ? 'slight-left' : 'slight-right')
            : stairsStart ? 'steps' : stairsEnd ? 'straight' : null
      if (action) {
        // 꺾는 곳과 계단 시작이 겹치면 꺾는 안내에 '(계단 포함)'을 붙입니다.
        close()
        current = { action, text: '', distance: 0 }
        stairs = false
      }
    } else {
      startBearing = bearing(part.a, part.b)
    }
    if (part.edge.kind === 'steps') stairs = true
    current.distance += distance(part.a, part.b)
  })
  // 마지막에 아주 짧게 꺾는 구간은 따로 안내하지 않고 도착 안내에 합칩니다.
  if (steps.length && current.distance < 10 && current.action !== 'steps' && current.action !== 'straight') {
    const side = current.action.includes('left') ? '왼쪽' : current.action.includes('right') ? '오른쪽' : ''
    steps.push({ action: 'arrive', text: side ? `${side}으로 조금만 가면 목적지입니다.` : '조금만 더 가면 목적지입니다.', distance: current.distance })
    return steps
  }
  close()
  steps.push({ action: 'arrive', text: '목적지에 도착했습니다.', distance: 0 })
  return steps
}

// 현재 위치가 경로에서 얼마나 떨어졌는지(m): 경로 이탈 판단에 씁니다.
export function distanceFromRoute(route: Route, point: LngLat) {
  const target = streetMeters(point)
  const meters = route.coordinates.map(streetMeters)
  let best = Infinity
  for (let i = 1; i < meters.length; i++) {
    const a = meters[i - 1], b = meters[i]
    const dx = b[0] - a[0], dz = b[1] - a[1]
    const lengthSquared = dx * dx + dz * dz
    const t = lengthSquared ? Math.max(0, Math.min(1, ((target[0] - a[0]) * dx + (target[1] - a[1]) * dz) / lengthSquared)) : 0
    best = Math.min(best, Math.hypot(target[0] - a[0] - dx * t, target[1] - a[1] - dz * t))
  }
  return best
}

let cachedGraph: { alleys: Alley[]; graph: WalkGraph } | undefined
// 그물망은 골목길 목록이 바뀔 때만 다시 만듭니다.
export function walkGraphFor(alleys: Alley[]) {
  if (!cachedGraph || cachedGraph.alleys !== alleys) cachedGraph = { alleys, graph: buildWalkGraph(alleys) }
  return cachedGraph.graph
}

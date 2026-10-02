import { describe, expect, it } from 'vitest'
import { ARTIST_WORKSHOP_PLACE } from './artistWorkshop'
import { buildWalkGraph, distanceFromRoute, findRoute, MAX_SNAP_DISTANCE, STAIRS_SPEED, WALKING_SPEED } from './routing'
import type { Route } from './routing'
import { streetMeters } from './streetSceneData'

const graph = buildWalkGraph()
const workshop: [number, number] = [ARTIST_WORKSHOP_PLACE.longitude, ARTIST_WORKSHOP_PLACE.latitude]
// 촬영 거리 남쪽 끝(카페아뽕 근처)
const streetStart: [number, number] = [129.00884, 35.0943657]
const asRoute = (result: Route | string) => {
  expect(typeof result).not.toBe('string')
  return result as Route
}

describe('walking routes', () => {
  it('connects almost every mapped street, alley, footway and stair into one network', () => {
    const component = new Array(graph.points.length).fill(-1)
    const sizes: number[] = []
    for (let start = 0; start < graph.points.length; start++) {
      if (component[start] >= 0) continue
      const stack = [start]
      component[start] = sizes.length
      let size = 0
      while (stack.length) {
        const node = stack.pop()!
        size++
        for (const edge of graph.edges[node]) if (component[edge.to] < 0) { component[edge.to] = sizes.length; stack.push(edge.to) }
      }
      sizes.push(size)
    }
    expect(Math.max(...sizes) / graph.points.length).toBeGreaterThan(0.95)
  })

  it('walks from the filmed street to the artist workshop with turn-by-turn directions', () => {
    const route = asRoute(findRoute(graph, streetStart, workshop))
    expect(route.coordinates[0]).toEqual(streetStart)
    expect(route.coordinates.at(-1)).toEqual(workshop)
    // 직선거리보다 길고, 너무 돌아가지 않습니다.
    const [a, b] = [streetMeters(streetStart), streetMeters(workshop)]
    const straight = Math.hypot(b[0] - a[0], b[1] - a[1])
    expect(route.distance).toBeGreaterThan(straight)
    expect(route.distance).toBeLessThan(straight * 1.6)
    expect(route.duration).toBeCloseTo(route.distance / WALKING_SPEED, 0)
    expect(route.steps[0].action).toBe('start')
    expect(route.steps.at(-1)!.action).toBe('arrive')
    expect(route.steps[0].text).toMatch(/쪽으로 \d+m 걸어가세요/)
  })

  it('counts stairs as slower and can avoid them', () => {
    // 이 두 지점 사이의 가장 빠른 길에는 계단이 있습니다.
    const from: [number, number] = [129.0076981, 35.0958768]
    const to: [number, number] = [129.0023339, 35.0949512]
    const withStairs = asRoute(findRoute(graph, from, to))
    expect(withStairs.stairsDistance).toBeGreaterThan(10)
    expect(withStairs.duration).toBeCloseTo(
      (withStairs.distance - withStairs.stairsDistance) / WALKING_SPEED + withStairs.stairsDistance / STAIRS_SPEED, 0)
    expect(withStairs.steps.some((step) => step.action === 'steps' || step.text.includes('계단'))).toBe(true)
    const noStairs = asRoute(findRoute(graph, from, to, { avoidStairs: true }))
    expect(noStairs.stairsDistance).toBe(0)
    expect(noStairs.distance).toBeGreaterThan(withStairs.distance)
  })

  it('refuses points too far from any mapped path', () => {
    // 지도 영역 바깥 바다 쪽 지점
    expect(findRoute(graph, [128.97, 35.07], workshop)).toBe('origin-off-network')
    expect(findRoute(graph, streetStart, [128.97, 35.07])).toBe('destination-off-network')
    expect(MAX_SNAP_DISTANCE).toBeGreaterThan(20)
  })

  it('uses alleys the user drew as walkable shortcuts', () => {
    const before = asRoute(findRoute(graph, streetStart, workshop))
    // 출발점에서 공방까지 거의 곧게 잇는 골목길
    const shortcut = buildWalkGraph([{ id: 'test', widthMeters: 3, coordinates: [streetStart, workshop] }])
    const after = asRoute(findRoute(shortcut, streetStart, workshop))
    expect(after.distance).toBeLessThan(before.distance)
  })

  it('measures how far a position has strayed from the route', () => {
    const route = asRoute(findRoute(graph, streetStart, workshop))
    expect(distanceFromRoute(route, route.coordinates[2])).toBeLessThan(0.5)
    expect(distanceFromRoute(route, [129.0105, 35.0975])).toBeGreaterThan(100)
  })
})

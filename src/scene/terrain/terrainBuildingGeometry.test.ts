import { describe, expect, it } from 'vitest'
import { terrainBuildingPlan, terrainWallGeometry } from './terrainBuildingGeometry'
import { TERRAIN_GROUND_LIFT } from '../groundGeometry'

const outline: [number, number][] = [[0, 0], [12, 0], [12, 8], [0, 8]]
const terrain = { height: (x: number, z: number) => 100 + x * 0.25 + z * 0.1 }

describe('terrain-first buildings', () => {
  it('uses the street-facing ground instead of the highest point as the floor datum', () => {
    const plan = terrainBuildingPlan(outline, terrain, (x) => x, [], 6.1)
    expect(plan.entrance!.x).toBe(0)
    expect(plan.base).toBeCloseTo(terrain.height(0, 4) + TERRAIN_GROUND_LIFT + 0.02)
    expect(plan.base).toBeLessThan(terrain.height(12, 8))
  })

  it('avoids a shared wall when choosing the entrance', () => {
    const plan = terrainBuildingPlan(outline, terrain, (x) => x, [3], 6.1)
    expect(plan.entrance!.shared).toBe(false)
    expect(plan.entrance!.x).not.toBe(0)
  })

  it('makes a sloping wall bottom while keeping the top level', () => {
    const plan = terrainBuildingPlan(outline, terrain, (x) => x, [], 6.1)
    const edge = plan.edges[0]
    const wall = terrainWallGeometry(edge.a, edge.b, edge.nx, edge.nz, plan.base, 6.1, terrain)
    const positions = wall.getAttribute('position')
    const lower: number[] = []
    for (let index = 0; index < positions.count; index++) {
      const y = positions.getY(index)
      if (Math.abs(y - 6.1) < 1e-5) continue
      const ground = terrain.height(positions.getX(index), positions.getZ(index)) + TERRAIN_GROUND_LIFT
      expect(plan.base + y).toBeCloseTo(ground - 0.15, 4)
      lower.push(y)
    }
    expect(Math.max(...lower) - Math.min(...lower)).toBeCloseTo(3)
    expect(Math.max(...lower)).toBeGreaterThan(0)
    expect(Math.min(...lower)).toBeLessThan(0)
    wall.dispose()
  })

  it('keeps the roof above uphill ground on a steep footprint', () => {
    const steep = { height: (x: number) => 100 + x }
    const plan = terrainBuildingPlan(outline, steep, (x) => x, [], 6.1)
    expect(plan.base + 6.1).toBeGreaterThan(steep.height(12) + TERRAIN_GROUND_LIFT + 0.7)
  })
})

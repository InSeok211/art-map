import surfaceWays from './street-surfaces.json'
import { RECORDED_ALLEY_WAYS } from './recordedAlleys'
import { getPhotographedStreetBuildings, streetMeters } from './streetSceneData'
import type { StreetPoint } from './streetSceneData'
import { GAMCHEON_MAP_BOUNDS } from './gamcheonBoundary'

export type SceneBounds = { minX: number; maxX: number; minZ: number; maxZ: number }

// Cover the entire navigable map and any footprints straddling its edges.
export function getStreetSceneBounds(padding = 0): SceneBounds {
  const points = getPhotographedStreetBuildings().flatMap((building) => building.outline.map(streetMeters))
  const corners = GAMCHEON_MAP_BOUNDS.map(streetMeters)
  points.push(...corners)
  return {
    minX: Math.min(...points.map(([x]) => x)) - padding,
    maxX: Math.max(...points.map(([x]) => x)) + padding,
    minZ: Math.min(...points.map(([, z]) => z)) - padding,
    maxZ: Math.max(...points.map(([, z]) => z)) + padding,
  }
}

export function clipSegmentToBounds(a: [number, number], b: [number, number], bounds: SceneBounds): [[number, number], [number, number]] | null {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  let start = 0
  let end = 1
  for (const [p, q] of [
    [-dx, a[0] - bounds.minX], [dx, bounds.maxX - a[0]],
    [-dz, a[1] - bounds.minZ], [dz, bounds.maxZ - a[1]],
  ]) {
    if (Math.abs(p) < 1e-10) {
      if (q < 0) return null
    } else {
      const t = q / p
      if (p < 0) start = Math.max(start, t)
      else end = Math.min(end, t)
      if (start > end) return null
    }
  }
  return [[a[0] + dx * start, a[1] + dz * start], [a[0] + dx * end, a[1] + dz * end]]
}

export function clipPolygonToBounds(points: [number, number][], bounds: SceneBounds): [number, number][] {
  let polygon = points
  for (const [inside, intersect] of [
    [(p: [number, number]) => p[0] >= bounds.minX, (a: [number, number], b: [number, number]) => [bounds.minX, a[1] + (b[1] - a[1]) * (bounds.minX - a[0]) / (b[0] - a[0])] as [number, number]],
    [(p: [number, number]) => p[0] <= bounds.maxX, (a: [number, number], b: [number, number]) => [bounds.maxX, a[1] + (b[1] - a[1]) * (bounds.maxX - a[0]) / (b[0] - a[0])] as [number, number]],
    [(p: [number, number]) => p[1] >= bounds.minZ, (a: [number, number], b: [number, number]) => [a[0] + (b[0] - a[0]) * (bounds.minZ - a[1]) / (b[1] - a[1]), bounds.minZ] as [number, number]],
    [(p: [number, number]) => p[1] <= bounds.maxZ, (a: [number, number], b: [number, number]) => [a[0] + (b[0] - a[0]) * (bounds.maxZ - a[1]) / (b[1] - a[1]), bounds.maxZ] as [number, number]],
  ] as const) {
    const output: [number, number][] = []
    for (let i = 0; i < polygon.length; i++) {
      const current = polygon[i]
      const previous = polygon[(i + polygon.length - 1) % polygon.length]
      if (inside(current)) {
        if (!inside(previous)) output.push(intersect(previous, current))
        output.push(current)
      } else if (inside(previous)) output.push(intersect(previous, current))
    }
    polygon = output
    if (polygon.length === 0) break
  }
  return polygon
}

// OSM 도로에 관리자가 확인한 골목길(recordedAlleys.ts)을 더해 씁니다.
export const STREET_SURFACE_WAYS = {
  ...surfaceWays,
  roads: [...surfaceWays.roads, ...RECORDED_ALLEY_WAYS],
} as unknown as {
  roads: { id: number; type: string; points: StreetPoint[]; width?: number }[]
  green: { id: number; points: StreetPoint[] }[]
}

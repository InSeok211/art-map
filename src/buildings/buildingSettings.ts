import { isInsideGamcheonMap } from '../map/gamcheonBoundary'
import { streetLngLat, streetMeters } from '../map/streetCoordinates'

export type BuildingPoint = [number, number]
export interface BuildingPlacement { longitude: number; latitude: number; rotation: number; scale: number }
export interface TerrainBuildingSettings {
  offsetMeters?: number
  baseElevationMeters?: number
  entrance?: BuildingPoint
  foundation?: boolean
}
export interface BuildingSettings {
  name?: string
  placement?: BuildingPlacement
  terrain?: TerrainBuildingSettings
  flatBaseMeters?: number
}

export function outlinePlacement(outline: BuildingPoint[]): BuildingPlacement {
  return { longitude: outline.reduce((sum, p) => sum + p[0], 0) / outline.length,
    latitude: outline.reduce((sum, p) => sum + p[1], 0) / outline.length, rotation: 0, scale: 1 }
}

export function placedOutline(outline: BuildingPoint[], placement?: BuildingPlacement): BuildingPoint[] {
  if (!placement) return outline
  const original = outlinePlacement(outline)
  const [cx, cz] = streetMeters([original.longitude, original.latitude])
  const [tx, tz] = streetMeters([placement.longitude, placement.latitude])
  const angle = placement.rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle)
  return outline.map((point) => {
    const [x, z] = streetMeters(point), dx = (x - cx) * placement.scale, dz = (z - cz) * placement.scale
    return streetLngLat([tx + dx * cos - dz * sin, tz + dx * sin + dz * cos])
  })
}

export function sanitizeBuildingSettings(value: unknown): BuildingSettings {
  if (!value || typeof value !== 'object') return {}
  const input = value as Record<string, unknown>, result: BuildingSettings = {}
  if (typeof input.name === 'string' && input.name.trim()) result.name = input.name.trim().slice(0, 120)
  const number = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value)) : undefined
  const flat = number(input.flatBaseMeters, -50, 50)
  if (flat !== undefined) result.flatBaseMeters = flat
  const placement = input.placement as Partial<BuildingPlacement> | undefined
  if (placement && typeof placement.longitude === 'number' && typeof placement.latitude === 'number'
    && isInsideGamcheonMap(placement.longitude, placement.latitude)
    && number(placement.rotation, -36000, 36000) !== undefined && number(placement.scale, 0.1, 5) !== undefined) {
    result.placement = { longitude: placement.longitude, latitude: placement.latitude,
      rotation: ((placement.rotation! % 360) + 360) % 360, scale: Math.max(0.1, Math.min(5, placement.scale!)) }
  }
  const terrain = input.terrain as TerrainBuildingSettings | undefined
  if (terrain && typeof terrain === 'object') {
    const clean: TerrainBuildingSettings = {}
    const offset = number(terrain.offsetMeters, -50, 50), base = number(terrain.baseElevationMeters, 0, 1000)
    if (offset !== undefined) clean.offsetMeters = offset
    if (base !== undefined) clean.baseElevationMeters = base
    if (Array.isArray(terrain.entrance) && terrain.entrance.length === 2 && terrain.entrance.every(Number.isFinite)
      && isInsideGamcheonMap(terrain.entrance[0], terrain.entrance[1])) clean.entrance = [...terrain.entrance]
    if (typeof terrain.foundation === 'boolean') clean.foundation = terrain.foundation
    if (Object.keys(clean).length) result.terrain = clean
  }
  return result
}

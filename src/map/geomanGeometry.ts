import type { Geometry } from 'geojson'
import { isInsideGamcheonMap } from './gamcheonBoundary'
import { streetMeters } from './streetCoordinates'

export type GeometryPoint = [number, number]

// The app stores open outlines; GeoJSON polygons repeat the first point.
export function geometryPoints(geometry: Geometry): GeometryPoint[] | null {
  const positions = geometry.type === 'LineString' ? geometry.coordinates
    : geometry.type === 'Polygon' && geometry.coordinates.length === 1 ? geometry.coordinates[0] : null
  if (!positions || positions.some(p => p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return null
  const points = positions.map(p => [p[0], p[1]] as GeometryPoint)
  if (geometry.type === 'Polygon' && points.length > 1 && points[0].every((v, axis) => v === points.at(-1)![axis])) points.pop()
  return points
}

export function validateGeometry(points: GeometryPoint[], shape: 'line' | 'polygon'): string {
  if (points.length < (shape === 'line' ? 2 : 3)) return shape === 'line' ? '골목길에는 점이 두 개 이상 필요합니다.' : '건물에는 점이 세 개 이상 필요합니다.'
  if (!points.every(([lng, lat]) => isInsideGamcheonMap(lng, lat))) return '사각형 지도 안쪽에 그려 주세요.'
  if (shape === 'polygon') {
    if (points.length > 60) return '건물 꼭짓점은 60개까지 사용할 수 있습니다.'
    const meters = points.map(streetMeters)
    const cross = (a: GeometryPoint, b: GeometryPoint, c: GeometryPoint) =>
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    const onSegment = (a: GeometryPoint, b: GeometryPoint, p: GeometryPoint) =>
      Math.abs(cross(a, b, p)) < 1e-7 && p[0] >= Math.min(a[0], b[0]) - 1e-7 && p[0] <= Math.max(a[0], b[0]) + 1e-7
      && p[1] >= Math.min(a[1], b[1]) - 1e-7 && p[1] <= Math.max(a[1], b[1]) + 1e-7
    for (let i = 0; i < meters.length; i++) {
      const a = meters[i], b = meters[(i + 1) % meters.length]
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.001) return '서로 다른 건물 꼭짓점을 찍어 주세요.'
      for (let j = i + 2; j < meters.length; j++) {
        if (i === 0 && j === meters.length - 1) continue
        const c = meters[j], d = meters[(j + 1) % meters.length]
        if ((cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0)
          || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b)) {
          return '건물 윤곽선이 서로 교차하지 않게 그려 주세요.'
        }
      }
    }
    const area = Math.abs(meters.reduce((sum, [x, z], i) => {
      const [nx, nz] = meters[(i + 1) % meters.length]
      return sum + x * nz - nx * z
    }, 0)) / 2
    if (area < 4) return '건물 윤곽은 4㎡ 이상으로 그려 주세요.'
  }
  return ''
}

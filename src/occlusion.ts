// 3D 모델이 화면에서 길을 가리는지 판단하는 2D 기하 계산입니다. 좌표는 모두 화면 픽셀입니다.
export type Point = [number, number]

const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

// 모델 경계 상자의 꼭짓점 8개를 화면에 투영한 점들의 볼록 껍질(반시계 방향)입니다.
export function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (sorted.length < 3) return sorted
  const lower: Point[] = []
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop()
    lower.push(point)
  }
  const upper: Point[] = []
  for (const point of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop()
    upper.push(point)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

// 가장자리에 살짝 닿는 길까지 가린다고 보지 않도록 껍질을 중심 쪽으로 줄입니다.
export function shrinkPolygon(polygon: Point[], ratio: number): Point[] {
  const cx = polygon.reduce((sum, [x]) => sum + x, 0) / polygon.length
  const cy = polygon.reduce((sum, [, y]) => sum + y, 0) / polygon.length
  return polygon.map(([x, y]) => [cx + (x - cx) * (1 - ratio), cy + (y - cy) * (1 - ratio)])
}

export function pointInConvexPolygon(point: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false
  for (let index = 0; index < polygon.length; index++) {
    if (cross(polygon[index], polygon[(index + 1) % polygon.length], point) < 0) return false
  }
  return true
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = cross(c, d, a)
  const d2 = cross(c, d, b)
  const d3 = cross(a, b, c)
  const d4 = cross(a, b, d)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

// 선(도로 중심선)이 볼록 다각형(모델이 화면에서 차지하는 영역)을 지나는지 확인합니다.
export function lineCrossesPolygon(line: Point[], polygon: Point[]): boolean {
  if (polygon.length < 3) return false
  if (line.some((point) => pointInConvexPolygon(point, polygon))) return true
  for (let index = 1; index < line.length; index++) {
    for (let edge = 0; edge < polygon.length; edge++) {
      if (segmentsIntersect(line[index - 1], line[index], polygon[edge], polygon[(edge + 1) % polygon.length])) return true
    }
  }
  return false
}

export function boundingBox(polygon: Point[]): [Point, Point] {
  const xs = polygon.map(([x]) => x)
  const ys = polygon.map(([, y]) => y)
  return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]]
}

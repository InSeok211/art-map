import { distanceToSegment, polygonArea } from './planGeometry'

// The pitched roof builder spans an oriented rectangle. Its footprint must
// nearly fill that rectangle or its eaves can project over neighboring space.
export function isSafeGableOutline(outline: [number, number][]) {
  let longest = { length: 0, ux: 1, uz: 0 }
  for (let index = 0; index < outline.length; index++) {
    const [ax, az] = outline[index]
    const [bx, bz] = outline[(index + 1) % outline.length]
    const dx = bx - ax
    const dz = bz - az
    const length = Math.hypot(dx, dz)
    if (length > longest.length) longest = { length, ux: dx / length, uz: dz / length }
  }
  const u = outline.map(([x, z]) => x * longest.ux + z * longest.uz)
  const v = outline.map(([x, z]) => -x * longest.uz + z * longest.ux)
  const rectangleArea = (Math.max(...u) - Math.min(...u)) * (Math.max(...v) - Math.min(...v))
  const area = polygonArea(outline)
  return rectangleArea > 0 && area / rectangleArea > 0.98
}

// 옥상 설비를 놓을 수 있도록 외곽선 안에서 벽과 가장 멀리 떨어진 점을 1.25m 격자로 찾습니다.
export function roofInteriorPoint(outline: [number, number][]) {
  const xs = outline.map(([x]) => x)
  const zs = outline.map(([, z]) => z)
  const west = Math.min(...xs)
  const east = Math.max(...xs)
  const north = Math.min(...zs)
  const south = Math.max(...zs)
  let best: { x: number, z: number, clearance: number } | undefined
  for (let x = west + 1; x < east; x += 1.25) for (let z = north + 1; z < south; z += 1.25) {
    let inside = false
    for (let index = 0, previous = outline.length - 1; index < outline.length; previous = index++) {
      const [ax, az] = outline[index]
      const [bx, bz] = outline[previous]
      if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside
    }
    if (!inside) continue
    let clearance = Infinity
    for (let index = 0; index < outline.length; index++) {
      clearance = Math.min(clearance, distanceToSegment(x, z, outline[index], outline[(index + 1) % outline.length]))
    }
    if (!best || clearance > best.clearance) best = { x, z, clearance }
  }
  return best
}

// 건물 외곽선·도로 중심선에 쓰는 평면(동-남 미터) 계산입니다.
export type PlanPoint = [number, number]

// 신발끈 공식으로 구한 다각형 넓이(m²)입니다.
export function polygonArea(outline: PlanPoint[]) {
  return Math.abs(outline.reduce((sum, [x, z], index) => {
    const [nextX, nextZ] = outline[(index + 1) % outline.length]
    return sum + x * nextZ - nextX * z
  }, 0) / 2)
}

// 꼭짓점 평균으로 구한 외곽선의 중심입니다.
export function outlineCenter(outline: PlanPoint[]): PlanPoint {
  return [
    outline.reduce((sum, [x]) => sum + x, 0) / outline.length,
    outline.reduce((sum, [, z]) => sum + z, 0) / outline.length,
  ]
}

// 점에서 선분까지의 최단 거리입니다. 길이가 0인 선분은 시작점까지의 거리입니다.
export function distanceToSegment(x: number, z: number, [ax, az]: PlanPoint, [bx, bz]: PlanPoint) {
  const dx = bx - ax
  const dz = bz - az
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)))
  return Math.hypot(x - ax - t * dx, z - az - t * dz)
}

// 벽면에 붙이는 평면(간판·파사드)이 바깥 법선(nx, nz) 쪽을 보도록 회전각을 고릅니다.
export function facingRotation(rotation: number, nx: number, nz: number) {
  return Math.sin(rotation) * nx + Math.cos(rotation) * nz >= 0 ? rotation : rotation + Math.PI
}

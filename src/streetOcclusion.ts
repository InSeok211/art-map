// 거리 장면의 건물이 지금 카메라에서 길을 가리는지 판단하는 계산입니다. 좌표는 장면 기준 미터(동, 남)입니다.
//
// 기울여 내려다보면 높이 h인 건물은 카메라 반대쪽 땅을 h·tan(기울기)만큼 가립니다. 건물 윤곽을 그 방향으로
// 밀어 본 자리(가려지는 땅)에 길이 있으면 길을 가린다고 봅니다. 수천 동을 카메라가 멈출 때마다 판단해야 해서,
// 화면 픽셀 대신 지도 좌표와 도로 중심선 격자 색인으로 가볍게 셉니다.

export interface Occluder { outline: [number, number][]; height: number }
interface RoadSegment { ax: number; az: number; bx: number; bz: number; half: number }

// 기울기가 이보다 작으면(거의 위에서 내려다봄) 가려지는 길이 없다고 봅니다.
export const MIN_OCCLUSION_PITCH = 15
// 아주 높은 건물·눕힌 카메라에서 가려지는 거리가 끝없이 길어지지 않게 막습니다(m).
export const MAX_HIDDEN_DISTANCE = 45
// 가려지는 땅에서 길 위에 떨어진 표본이 이만큼 이상이면 길을 가린다고 봅니다.
export const MIN_ROAD_HITS = 2

const CELL = 20

export class RoadIndex {
  private cells = new Map<string, RoadSegment[]>()

  constructor(runs: { points: [number, number][]; width: number }[]) {
    for (const run of runs) for (let i = 1; i < run.points.length; i++) {
      const [ax, az] = run.points[i - 1], [bx, bz] = run.points[i]
      const segment = { ax, az, bx, bz, half: run.width / 2 }
      const x0 = Math.floor((Math.min(ax, bx) - segment.half) / CELL), x1 = Math.floor((Math.max(ax, bx) + segment.half) / CELL)
      const z0 = Math.floor((Math.min(az, bz) - segment.half) / CELL), z1 = Math.floor((Math.max(az, bz) + segment.half) / CELL)
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const key = `${x},${z}`
        const list = this.cells.get(key)
        if (list) list.push(segment)
        else this.cells.set(key, [segment])
      }
    }
  }

  // 점이 어느 길의 폭 안에 있는지
  contains(x: number, z: number) {
    const list = this.cells.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`)
    if (!list) return false
    for (const { ax, az, bx, bz, half } of list) {
      const dx = bx - ax, dz = bz - az
      const lengthSquared = dx * dx + dz * dz
      const t = lengthSquared ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSquared)) : 0
      if (Math.hypot(x - ax - dx * t, z - az - dz * t) <= half) return true
    }
    return false
  }
}

function inside([x, z]: [number, number], polygon: [number, number][]) {
  let result = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [ax, az] = polygon[index], [bx, bz] = polygon[previous]
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) result = !result
  }
  return result
}

// 화면에서 보고 있는 범위(지도 중심과 반경, 장면 미터). 이 밖의 건물은 작게 보여 비칠 필요가 없고, 비치게
// 그리는 셰이더는 일반 셰이더보다 무거우므로 고르지 않습니다.
export interface OcclusionFocus { x: number; z: number; radius: number }

// bearing: 지도 방위(북쪽 기준 시계 방향, 도), pitch: 기울기(0 = 바로 위, 도)
export function findRoadOccluders(occluders: Occluder[], roads: RoadIndex, bearing: number, pitch: number, focus?: OcclusionFocus): Set<number> {
  const result = new Set<number>()
  if (pitch < MIN_OCCLUSION_PITCH) return result
  const radians = bearing * Math.PI / 180
  // 카메라가 바라보는 수평 방향(동, 남): 건물 뒤쪽(가려지는 땅)이 이쪽입니다.
  const forward: [number, number] = [Math.sin(radians), -Math.cos(radians)]
  const slope = Math.tan(Math.min(pitch, 85) * Math.PI / 180)
  occluders.forEach(({ outline, height }, index) => {
    const reach = Math.min(height * slope, MAX_HIDDEN_DISTANCE)
    if (reach < 1) return
    const cx = outline.reduce((sum, [x]) => sum + x, 0) / outline.length
    const cz = outline.reduce((sum, [, z]) => sum + z, 0) / outline.length
    if (focus && Math.hypot(cx - focus.x, cz - focus.z) > focus.radius) return
    let hits = 0
    for (const [x, z] of [...outline, [cx, cz] as [number, number]]) {
      for (const t of [0.4, 0.75, 1]) {
        const sample: [number, number] = [x + forward[0] * reach * t, z + forward[1] * reach * t]
        // 건물 자기 자리(지붕 아래)는 길이 아니므로 세지 않습니다.
        if (inside(sample, outline)) continue
        if (roads.contains(...sample) && ++hits >= MIN_ROAD_HITS) { result.add(index); return }
      }
    }
  })
  return result
}

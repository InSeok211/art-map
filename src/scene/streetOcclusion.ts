// 거리 장면의 건물이 지금 카메라에서 내 위치(GPS)를 가리는지 판단하는 계산입니다. 좌표는 장면 기준 미터(동, 남)입니다.
//
// 기울여 내려다보면 높이 h인 건물은 카메라 반대쪽 땅을 h·tan(기울기)만큼 가립니다. 내 위치가 그 가려지는 땅 안에
// 있으면(내 위치에서 카메라 쪽으로 거슬러 가다 건물 윤곽에 닿으면) 그 건물이 나를 덮는다고 봅니다.
// (길을 가리는 건물을 모두 비치게 하던 findRoadOccluders·RoadIndex는 2026-10-09에 쓰지 않게 되어 2026-10-27에 지웠습니다.)

export interface Occluder { outline: [number, number][]; height: number }

// 기울기가 이보다 작으면(거의 위에서 내려다봄) 가려지는 땅이 없다고 봅니다.
export const MIN_OCCLUSION_PITCH = 15
// 아주 높은 건물·눕힌 카메라에서 가려지는 거리가 끝없이 길어지지 않게 막습니다(m).
export const MAX_HIDDEN_DISTANCE = 45

function inside([x, z]: [number, number], polygon: [number, number][]) {
  let result = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [ax, az] = polygon[index], [bx, bz] = polygon[previous]
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) result = !result
  }
  return result
}

// 내 위치(GPS)를 가리는 건물: 건물이 카메라 반대쪽 땅을 가리는 범위(높이·기울기로 정해짐) 안에 내 위치가 있거나,
// GPS 오차로 내 위치가 건물 윤곽 안에 찍혔으면 그 건물이 내 위치를 덮는다고 봅니다. 내 위치에서 카메라 쪽으로
// 거슬러 가며 건물 윤곽에 닿는지만 보므로, 주변(radius m) 건물만 셉니다.
export const POINT_OCCLUSION_RADIUS = 60

// bearing: 지도 방위(북쪽 기준 시계 방향, 도), pitch: 기울기(0 = 바로 위, 도)
export function findPointOccluders(occluders: Occluder[], point: [number, number], bearing: number, pitch: number): Set<number> {
  const result = new Set<number>()
  const [px, pz] = point
  const radians = bearing * Math.PI / 180
  // 카메라가 바라보는 수평 방향(동, 남): 건물 뒤쪽(가려지는 땅)이 이쪽입니다.
  const forward: [number, number] = [Math.sin(radians), -Math.cos(radians)]
  const slope = Math.tan(Math.min(Math.max(pitch, 0), 85) * Math.PI / 180)
  occluders.forEach(({ outline, height }, index) => {
    const cx = outline.reduce((sum, [x]) => sum + x, 0) / outline.length
    const cz = outline.reduce((sum, [, z]) => sum + z, 0) / outline.length
    if (Math.hypot(cx - px, cz - pz) > POINT_OCCLUSION_RADIUS) return
    if (inside(point, outline)) { result.add(index); return }
    if (pitch < MIN_OCCLUSION_PITCH) return
    const reach = Math.min(height * slope, MAX_HIDDEN_DISTANCE)
    // 내 위치에서 카메라 쪽(forward의 반대)으로 0.5m 간격으로 거슬러 가며 건물 윤곽에 닿는지 봅니다.
    for (let distance = 0.5; distance <= reach; distance += 0.5) {
      if (inside([px - forward[0] * distance, pz - forward[1] * distance], outline)) { result.add(index); return }
    }
  })
  return result
}

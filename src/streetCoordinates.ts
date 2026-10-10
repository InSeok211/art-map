// 거리 장면의 좌표 기준입니다. 감천2동 안의 경도·위도를 기준점(STREET_ORIGIN)에서 잰 미터(동쪽 x, 남쪽 z)로
// 바꿉니다. MapLibre·Three 3D 층과 골목길 후보 계산(gpsTrails), GPS 기록이 모두 이 변환을 함께 씁니다.
// (동네 하나 크기에서는 평면으로 펴서 계산해도 오차가 1cm 안팎입니다.)

export type LngLatPoint = [longitude: number, latitude: number]

export const STREET_ORIGIN: LngLatPoint = [129.0089, 35.0949]
export const METERS_PER_DEGREE_LAT = 111_320
const METERS_PER_DEGREE_LON = METERS_PER_DEGREE_LAT * Math.cos(STREET_ORIGIN[1] * Math.PI / 180)

// East and south axes match the shared MapLibre/Three model layer coordinates.
export function streetMeters([longitude, latitude]: readonly [number, number, ...number[]]): [number, number] {
  return [(longitude - STREET_ORIGIN[0]) * METERS_PER_DEGREE_LON, (STREET_ORIGIN[1] - latitude) * METERS_PER_DEGREE_LAT]
}

export function streetLngLat([x, z]: readonly [number, number]): LngLatPoint {
  return [STREET_ORIGIN[0] + x / METERS_PER_DEGREE_LON, STREET_ORIGIN[1] - z / METERS_PER_DEGREE_LAT]
}

// 두 경도·위도 점 사이의 거리(m)와 선의 길이(m)
export function distanceMeters(a: readonly [number, number, ...number[]], b: readonly [number, number, ...number[]]) {
  const [ax, az] = streetMeters(a), [bx, bz] = streetMeters(b)
  return Math.hypot(bx - ax, bz - az)
}

export function pathLengthMeters(points: readonly (readonly [number, number, ...number[]])[]) {
  let total = 0
  for (let index = 1; index < points.length; index++) total += distanceMeters(points[index - 1], points[index])
  return total
}

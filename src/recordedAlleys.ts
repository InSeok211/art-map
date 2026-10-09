import recorded from './recorded-alleys.json'
import { sanitizeAlleys } from './alleys'
import type { Alley } from './alleys'

// 관리자가 확인해 홈페이지에 저장한 골목길(손으로 그린 것과 GPS 기록으로 찾은 것)을 배포할 때 받아 둔 사본입니다.
// `npm run pull:alleys -- <홈페이지 주소>`로 갱신하고 `npm run build:road-ground`를 다시 돌리면, 이 골목길도
// 도로 바닥에 구워지고 그 위에 걸친 건물이 깎입니다. 그 뒤에 새로 추가한 골목길은 다음 배포 전까지
// 거리 장면이 바닥 위에 따로 그립니다(StreetSceneLayer.setExtraAlleys).
export const RECORDED_ALLEYS: Alley[] = sanitizeAlleys(recorded)

// 도로 데이터(street-surfaces.json)와 같은 모양. roadWidth()가 폭이 적힌 길을 15% 넓히므로 미리 나눠 둡니다.
export const RECORDED_ALLEY_WAYS = RECORDED_ALLEYS.map((alley, index) => ({
  id: -(index + 1),
  type: 'footway',
  width: alley.widthMeters / 1.15,
  points: alley.coordinates,
}))

const bakedKey = (alley: Alley) => JSON.stringify([alley.id, alley.coordinates, alley.widthMeters])
const BAKED = new Set(RECORDED_ALLEYS.map(bakedKey))
// 이미 도로 바닥에 구워진 골목길인지(모양·폭까지 같아야 함)
export const isBakedAlley = (alley: Alley) => BAKED.has(bakedKey(alley))

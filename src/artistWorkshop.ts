import type { MapModel } from './modelCatalog'
import type { Place } from './types'

const ADDRESS_LONGITUDE = 129.00925868855
const ADDRESS_LATITUDE = 35.095522407839

// 공방(꿈꾸는작업실, 옥천로101번길 23)은 이제 거리 장면이 로드뷰로 보정한 윤곽에 전용 모델로 직접 그립니다
// (streetSceneData의 splitWorkshopFootprint, artistWorkshopModel.ts).
// 아래 GLB 배치는 필요할 때 3D 배치 탭에서 쓸 수 있도록 남겨 두지만 기본으로 넣지는 않습니다.
export const ARTIST_WORKSHOP_MODEL: MapModel = {
  id: 'artist-workshop-180',
  assetId: 'artist-workshop',
  longitude: 129.00918935,
  latitude: 35.0954431,
  widthMeters: 8.6,
  rotation: 61.2,
  altitudeMeters: 0,
}

// 예전에 자동으로 넣었던 기본 배치(사용자가 고치지 않은 것)입니다.
const PREVIOUS_DEFAULT_PLACEMENTS: Pick<MapModel, 'longitude' | 'latitude' | 'widthMeters' | 'rotation'>[] = [
  { longitude: ADDRESS_LONGITUDE, latitude: ADDRESS_LATITUDE, widthMeters: 10.5, rotation: 0 },
  { longitude: 129.00930268855, latitude: ADDRESS_LATITUDE, widthMeters: 9.5, rotation: 0 },
  { longitude: 129.00930268855, latitude: ADDRESS_LATITUDE, widthMeters: 12.5, rotation: 0 },
  // 반경 12m 건물을 지우고 크게 덮던 배치(폭 15.5m, 90°)
  { longitude: 129.00930268855, latitude: ADDRESS_LATITUDE, widthMeters: 15.5, rotation: 90 },
  // 이웃 윤곽(1468590621)을 공방으로 잘못 잡았던 배치와, 보정 전 OSM 띠 윤곽의 중심에 두었던 배치
  { longitude: 129.00929761, latitude: 35.09548788, widthMeters: 8.6, rotation: 61.2 },
  { longitude: 129.0092292, latitude: 35.0954356, widthMeters: 8.6, rotation: 61.2 },
  ARTIST_WORKSHOP_MODEL,
]

// 거리 장면이 공방을 직접 그리므로, 자동으로 들어갔던 기본 GLB(손대지 않은 것)는 겹치지 않게 뺍니다.
// 사용자가 옮기거나 크기·회전을 바꾼 GLB는 의도한 배치로 보고 그대로 둡니다.
export function removeUntouchedWorkshopModel(models: MapModel[]): MapModel[] {
  const next = models.filter((model) => !(model.id === ARTIST_WORKSHOP_MODEL.id && model.assetId === ARTIST_WORKSHOP_MODEL.assetId
    && model.altitudeMeters === 0 && PREVIOUS_DEFAULT_PLACEMENTS.some((placement) => placement.longitude === model.longitude
      && placement.latitude === model.latitude && placement.widthMeters === model.widthMeters && placement.rotation === model.rotation)))
  return next.length === models.length ? models : next
}

// 카카오맵 장소 '꿈꾸는작업실'의 도로명 주소입니다. 핀은 보정한 공방 윤곽의 중심에 둡니다.
export const ARTIST_WORKSHOP_PLACE: Place = {
  id: 'artist-workshop-place-180',
  name: '작가님 공방',
  category: 'attraction',
  longitude: ARTIST_WORKSHOP_MODEL.longitude,
  latitude: ARTIST_WORKSHOP_MODEL.latitude,
  address: '부산 사하구 옥천로101번길 23',
  description: '작가님이 작업하는 공방, 꿈꾸는작업실입니다.',
}

// 예전 기본 좌표(주소점, 잘못 잡았던 이웃 윤곽, 보정 전 띠 윤곽)에 그대로 있는 기본 장소만 공방 건물 위로 옮깁니다.
const PREVIOUS_PLACE_POINTS = [[ADDRESS_LONGITUDE, ADDRESS_LATITUDE], [129.00929761, 35.09548788], [129.0092292, 35.0954356]]
// 처음 넣었던 주소(감내1로 180)를 그대로 둔 기본 장소는 실제 공방 주소로 바꿉니다.
const PREVIOUS_ADDRESS = '부산 사하구 감내1로 180'
// 편집용으로 썼던 기본 설명을 그대로 둔 장소는 방문자용 설명으로 바꿉니다.
const PREVIOUS_DESCRIPTION = '사진과 로드뷰를 참고해 만든 3D 건물 시안입니다. 위치·크기·회전을 수정할 수 있습니다.'

export function refineArtistWorkshopPlace(places: Place[]): Place[] {
  let changed = false
  const next = places.map((place) => {
    if (place.id !== ARTIST_WORKSHOP_PLACE.id) return place
    const moved = PREVIOUS_PLACE_POINTS.some(([longitude, latitude]) => place.longitude === longitude && place.latitude === latitude)
    const readdressed = place.address === PREVIOUS_ADDRESS
    const redescribed = place.description === PREVIOUS_DESCRIPTION
    if (!moved && !readdressed && !redescribed) return place
    changed = true
    return {
      ...place,
      ...(moved ? { longitude: ARTIST_WORKSHOP_PLACE.longitude, latitude: ARTIST_WORKSHOP_PLACE.latitude } : {}),
      ...(readdressed ? { address: ARTIST_WORKSHOP_PLACE.address } : {}),
      ...(redescribed ? { description: ARTIST_WORKSHOP_PLACE.description } : {}),
    }
  })
  return changed ? next : places
}

export function seedArtistWorkshopPlace(places: Place[], seeded: boolean): Place[] {
  return seeded || places.some((place) => place.id === ARTIST_WORKSHOP_PLACE.id)
    ? places
    : [...places, { ...ARTIST_WORKSHOP_PLACE }]
}

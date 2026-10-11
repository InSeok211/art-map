import type { Place } from '../types'

const ADDRESS_LONGITUDE = 129.00925868855
const ADDRESS_LATITUDE = 35.095522407839

// 공방(꿈꾸는작업실, 옥천로101번길 23)은 거리 장면이 로드뷰로 보정한 윤곽에 전용 모델로 직접 그립니다
// (streetSceneData의 splitWorkshopFootprint, artistWorkshopModel.ts). 아래는 보정한 공방 윤곽의 중심입니다.
const WORKSHOP_CENTER = { longitude: 129.00918935, latitude: 35.0954431 }

// 카카오맵 장소 '꿈꾸는작업실'의 도로명 주소입니다. 핀은 보정한 공방 윤곽의 중심에 둡니다.
export const ARTIST_WORKSHOP_PLACE: Place = {
  id: 'artist-workshop-place-180',
  name: '작가님 공방',
  category: 'attraction',
  longitude: WORKSHOP_CENTER.longitude,
  latitude: WORKSHOP_CENTER.latitude,
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

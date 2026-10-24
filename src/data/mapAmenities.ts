import type { Place, PlaceCategory } from '../types'
import busStops from './gamcheon-bus-stops.json'

// OpenStreetMap contributors, ODbL. Overpass snapshot base: 2026-07-15.
// These are map candidates, not a verification of public access or hours.
// [OSM node id, category, latitude, longitude]
const points: [number, Extract<PlaceCategory, 'toilets'>, number, number][] = [
  [6924043187, 'toilets', 35.0985138, 129.0091825],
  [6924087486, 'toilets', 35.0977265, 129.0105011],
  [6924087487, 'toilets', 35.0985277, 129.0100606],
  [9657908525, 'toilets', 35.0996994, 129.0122466],
  [11166195005, 'toilets', 35.0879178, 129.015572],
  [11853831032, 'toilets', 35.0972918, 129.0094237],
  [11853836253, 'toilets', 35.0936128, 129.0026825],
  [12878495601, 'toilets', 35.0967595, 129.0081532],
  [13075407401, 'toilets', 35.0943191, 129.0080254],
  [13509548714, 'toilets', 35.0976417, 129.0083769],
]

let toiletCount = 0
const osmAmenities: Place[] = points.map(([id, category, latitude, longitude]) => ({
  id: `osm-node-${id}`,
  name: `화장실 위치 ${++toiletCount}`,
  category,
  latitude,
  longitude,
  description: 'OpenStreetMap 위치 자료 · 개방 여부와 운영시간 확인 전',
}))

// 버스 정류장은 부산버스정보시스템(BIMS)에 등록된 정류소의 위치·이름·노선으로 둡니다(gamcheon-bus-stops.json).
// 같은 자리에 마을버스·시내버스 정류소 번호가 따로 있으면 표식 하나로 묶고, 도착정보는 묶은 번호를 모두 조회합니다.
// 예전 표식 ID(OpenStreetMap 번호 등)는 그대로 둬서 고른 장소·정류장 쉘터 3D가 이어집니다.
export const REGISTERED_BUS_STOPS: Place[] = busStops.map(stop => ({
  id: stop.id,
  name: `${stop.name} (${stop.next} 방면)`,
  category: 'bus_stop',
  latitude: stop.latitude,
  longitude: stop.longitude,
  description: `버스 ${stop.routes.join(' · ')} · 다음 정류장: ${stop.next} · ${stop.checkedAt} 부산버스정보시스템 정류소 자료`,
}))

export const MAP_AMENITIES: Place[] = [...osmAmenities, ...REGISTERED_BUS_STOPS]

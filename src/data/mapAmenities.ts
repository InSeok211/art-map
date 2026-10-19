import type { Place, PlaceCategory } from '../types'

// OpenStreetMap contributors, ODbL. Overpass snapshot base: 2026-07-15.
// These are map candidates, not a verification of public access, hours, or bus service.
// [OSM node id, category, latitude, longitude, mapped name]
const points: [number, Extract<PlaceCategory, 'toilets' | 'bus_stop'>, number, number, string?][] = [
  [3859163057, 'bus_stop', 35.0972086, 129.0101505, '감천문화마을·부산교육역사관 (구감 방면)'],
  [3859163058, 'bus_stop', 35.0973041, 129.0106455, '감천문화마을·부산교육역사관 (한샘슈퍼 방면)'],
  [4473495859, 'bus_stop', 35.1000425, 129.0159166],
  [5006392764, 'bus_stop', 35.0878391, 129.0041471, '감천1동주민센터·부산천연가스발전소'],
  [6924043187, 'toilets', 35.0985138, 129.0091825],
  [6924087486, 'toilets', 35.0977265, 129.0105011],
  [6924087487, 'toilets', 35.0985277, 129.0100606],
  [9657838805, 'bus_stop', 35.0984172, 129.0120983],
  [9657908525, 'toilets', 35.0996994, 129.0122466],
  [11166195005, 'toilets', 35.0879178, 129.015572],
  [11252131056, 'bus_stop', 35.1012812, 129.0115548],
  [11252131057, 'bus_stop', 35.1014154, 129.0116005],
  [11853831032, 'toilets', 35.0972918, 129.0094237],
  [11853836253, 'toilets', 35.0936128, 129.0026825],
  [12878495601, 'toilets', 35.0967595, 129.0081532],
  [13075407401, 'toilets', 35.0943191, 129.0080254],
  [13509548714, 'toilets', 35.0976417, 129.0083769],
]

let toiletCount = 0
let busCount = 0
export const MAP_AMENITIES: Place[] = points.map(([id, category, latitude, longitude, mappedName]) => ({
  id: `osm-node-${id}`,
  name: mappedName ?? (category === 'toilets' ? `화장실 위치 ${++toiletCount}` : `버스 정류장 위치 ${++busCount}`),
  category,
  latitude,
  longitude,
  description: id === 3859163057
    ? '카카오 로드뷰(2025년 11월)를 참고한 정류장 쉘터 3D 시안 · 크기와 정확한 위치는 현장 확인 전'
    : category === 'toilets'
    ? 'OpenStreetMap 위치 자료 · 개방 여부와 운영시간 확인 전'
    : 'OpenStreetMap 위치 자료 · 정류장 번호와 운행 노선 확인 전',
}))

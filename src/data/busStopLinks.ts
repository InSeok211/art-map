import stops from './gamcheon-bus-stops.json'

// 지도 장소 ID → 부산버스정보시스템 정류소 번호. 목록(gamcheon-bus-stops.json)에 있는 정류장만 도착정보를 조회할 수 있습니다.
// 화면은 이 목록으로 도착정보 버튼을 보여 줄지 정하고, 서버는 조회할 정류소 번호를 찾습니다.
const stopIds = new Map(stops.map((stop) => [stop.replaces ?? stop.id, stop.id.replace('busan-BSB', '')]))

export const busStopIdFor = (placeId: string) => stopIds.get(placeId)

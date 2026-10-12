import type { GpsTrail } from './gpsTrails'

// 지도 앱 서버의 관리자 전용 GPS 기록 주소입니다(편집 앱에서 GPX로 올린 기록). 로그인한 관리자만 쓸 수 있습니다.
const TRAILS_API = '/api/admin/gps-trails'

export async function postTrail(trail: GpsTrail) {
  const response = await fetch(TRAILS_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(trail),
  })
  if (!response.ok) throw new Error(String(response.status))
  return response
}

export async function deleteTrail(id: string) {
  const response = await fetch(`${TRAILS_API}?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(String(response.status))
}

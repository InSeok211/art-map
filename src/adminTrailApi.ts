import type { GpsTrail } from './gpsTrails'

// 홈페이지(감천 작가 지도)의 관리자 전용 GPS 기록 주소입니다. 같은 출처의 로그인 쿠키로 관리자만 쓸 수 있습니다.
export async function isSiteAdmin() {
  try {
    const response = await fetch('/api/admin/session', { cache: 'no-store' })
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return false
    return (await response.json() as { admin?: boolean }).admin === true
  } catch {
    return false
  }
}

const TRAILS_API = '/api/admin/gps-trails'

export async function postTrail(trail: GpsTrail, keepalive = false) {
  const response = await fetch(TRAILS_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(trail),
    keepalive,
  })
  if (!response.ok) throw new Error(String(response.status))
  return response
}

export async function deleteTrail(id: string) {
  const response = await fetch(`${TRAILS_API}?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(String(response.status))
}

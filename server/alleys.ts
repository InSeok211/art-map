import type { Env } from './env'
import { error, json, readJson } from './http'

// 골목길(관리자가 그리거나 GPS 기록으로 찾아 확인한 길)과 관리자 GPS 기록입니다(예전 홈페이지 app/map/map-alleys-db.ts
// 에서 옮김). 감천 작업 범위 밖의 좌표는 받지 않습니다(GPS 기록은 범위 밖 점을 버려 집·이동 경로가 남지 않게 함).
export const WORK_AREA = { west: 129.006, south: 35.09274, east: 129.0135, north: 35.0992 }

type LngLat = [number, number]
type Alley = { id: string; name?: string; coordinates: LngLat[]; widthMeters: number }
type TrailPoint = [number, number, number, number]

const MAX_ALLEYS = 500
const MAX_LINE_POINTS = 500
const MAX_TRAIL_POINTS = 10_000

const insideWorkArea = (lng: number, lat: number) =>
  lng >= WORK_AREA.west && lng <= WORK_AREA.east && lat >= WORK_AREA.south && lat <= WORK_AREA.north
const round7 = (value: number) => Math.round(value * 1e7) / 1e7

function cleanLine(value: unknown): LngLat[] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_LINE_POINTS) return null
  const line: LngLat[] = []
  for (const point of value) {
    if (!Array.isArray(point) || point.length !== 2 || !point.every((part) => typeof part === 'number' && Number.isFinite(part))) return null
    if (!insideWorkArea(point[0], point[1])) return null
    line.push([round7(point[0]), round7(point[1])])
  }
  return line
}

// 받은 골목길 목록을 검사합니다. 하나라도 잘못되면 null(저장하지 않음).
export function cleanAlleys(value: unknown): Alley[] | null {
  if (!Array.isArray(value) || value.length > MAX_ALLEYS) return null
  const alleys: Alley[] = []
  for (const item of value) {
    const alley = item as Partial<Alley> | null
    if (!alley || typeof alley.id !== 'string' || !alley.id || alley.id.length > 80) return null
    if (alley.name !== undefined && (typeof alley.name !== 'string' || alley.name.length > 60)) return null
    const width = Number(alley.widthMeters)
    if (!Number.isFinite(width) || width < 1 || width > 8) return null
    const coordinates = cleanLine(alley.coordinates)
    if (!coordinates) return null
    alleys.push({ id: alley.id, ...(alley.name ? { name: alley.name } : {}), coordinates, widthMeters: width })
  }
  return alleys
}

export function cleanLines(value: unknown): LngLat[][] | null {
  if (!Array.isArray(value) || value.length > MAX_ALLEYS) return null
  const lines: LngLat[][] = []
  for (const item of value) {
    const line = cleanLine(item)
    if (!line) return null
    lines.push(line)
  }
  return lines
}

async function readAlleys(env: Env) {
  const row = await env.DB.prepare("SELECT alleys_json, dismissed_json, updated_at FROM map_alleys WHERE id = 'active'")
    .first<{ alleys_json: string; dismissed_json: string; updated_at: string }>()
  return {
    alleys: row ? cleanAlleys(JSON.parse(row.alleys_json)) ?? [] : [],
    dismissed: row ? cleanLines(JSON.parse(row.dismissed_json)) ?? [] : [],
    updatedAt: row?.updated_at ?? null,
  }
}

// 공개 지도: 확인한 골목길만(GPS 기록·버린 후보는 내보내지 않음)
export async function publicAlleys(env: Env) {
  const { alleys, updatedAt } = await readAlleys(env)
  return json({ alleys, updatedAt }, { headers: { 'cache-control': 'public, max-age=60' } })
}

export const adminAlleys = async (env: Env) => json(await readAlleys(env))

export async function saveAlleys(request: Request, env: Env) {
  const body = await readJson(request)
  const alleys = cleanAlleys(body?.alleys)
  const dismissed = cleanLines(body?.dismissed ?? [])
  if (!alleys || !dismissed) return error('골목길은 감천 작업 범위 안에서 2~500개 점, 폭 1~8m로 지정해주세요.', 400)
  await env.DB.prepare(`INSERT INTO map_alleys (id, alleys_json, dismissed_json, updated_at) VALUES ('active', ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET alleys_json = excluded.alleys_json, dismissed_json = excluded.dismissed_json, updated_at = CURRENT_TIMESTAMP`)
    .bind(JSON.stringify(alleys), JSON.stringify(dismissed)).run()
  return json({ alleys, dismissed })
}

// GPS 기록(편집 앱에서 GPX로 올린 것). 관리자만 읽고 쓰며 공개 지도에는 나가지 않습니다.
export async function listTrails(env: Env) {
  const { results } = await env.DB.prepare('SELECT id, started_at, points_json FROM gps_trails ORDER BY started_at')
    .all<{ id: string; started_at: string; points_json: string }>()
  return json({ trails: results.map((row) => ({ id: row.id, startedAt: row.started_at, points: JSON.parse(row.points_json) })) })
}

export async function saveTrail(request: Request, env: Env) {
  const body = await readJson(request)
  if (!body || typeof body.id !== 'string' || !body.id || body.id.length > 80 || typeof body.startedAt !== 'string'
    || Number.isNaN(Date.parse(body.startedAt)) || !Array.isArray(body.points) || body.points.length > MAX_TRAIL_POINTS) {
    return error(`기록 형식이 맞지 않거나 너무 깁니다(최대 ${MAX_TRAIL_POINTS}점).`, 400)
  }
  // 감천 작업 범위 밖의 점은 저장하지 않습니다.
  const points: TrailPoint[] = body.points.flatMap((point: unknown) => {
    if (!Array.isArray(point) || point.length !== 4 || !point.every((part) => typeof part === 'number' && Number.isFinite(part))) return []
    const [lng, lat, accuracy, time] = point as TrailPoint
    return insideWorkArea(lng, lat) ? [[round7(lng), round7(lat), Math.round(accuracy * 10) / 10, Math.round(time)] as TrailPoint] : []
  })
  if (points.length < 5) return error('감천 작업 범위 안에서 기록한 위치가 너무 적습니다.', 400)
  const startedAt = new Date(body.startedAt).toISOString()
  await env.DB.prepare(`INSERT INTO gps_trails (id, started_at, points_json) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET points_json = excluded.points_json`)
    .bind(body.id, startedAt, JSON.stringify(points)).run()
  return json({ trail: { id: body.id, startedAt, points } })
}

export async function deleteTrail(url: URL, env: Env) {
  const id = url.searchParams.get('id')
  if (!id) return error('지울 기록을 알려주세요.', 400)
  await env.DB.prepare('DELETE FROM gps_trails WHERE id = ?').bind(id).run()
  return json({ ok: true })
}

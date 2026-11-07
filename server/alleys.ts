import { alleyLabel, alleyProblem, lineProblem } from '../src/alleys/alleyRules'
import type { AlleyProblem } from '../src/alleys/alleyRules'
import type { Alley, LngLat } from '../src/alleys/alleys'
import type { MapEnv } from './env'
import { error, json, readJson } from './http'

// 골목길(관리자가 그리거나 GPS 기록으로 찾아 확인한 길)과 관리자 GPS 기록입니다(예전 홈페이지 app/map/map-alleys-db.ts
// 에서 옮김). 골목길 규칙은 편집 화면과 함께 쓰는 src/alleys/alleyRules.ts에 있습니다.
// GPS 기록은 작업 범위 안의 점만 남깁니다. 집과 이동 경로가 서버에 남지 않게 하기 위해서입니다.
const WORK_AREA = { west: 129.006, south: 35.09274, east: 129.0135, north: 35.0992 }
type TrailPoint = [number, number, number, number]

const MAX_ALLEYS = 500
const MAX_TRAIL_POINTS = 10_000

const insideWorkArea = (lng: number, lat: number) =>
  lng >= WORK_AREA.west && lng <= WORK_AREA.east && lat >= WORK_AREA.south && lat <= WORK_AREA.north

const round7 = (value: number) => Math.round(value * 1e7) / 1e7
const cleanLine = (line: LngLat[]) => line.map(([lng, lat]): LngLat => [round7(lng), round7(lat)])

// 목록을 규칙에 맞는 골목과 어긋난 원본으로 나눕니다.
function sortAlleys(items: unknown[]) {
  const valid: Alley[] = []
  const invalid: unknown[] = []
  const problems: AlleyProblem[] = []
  items.forEach((item, index) => {
    const reason = alleyProblem(item)
    if (reason === null) {
      const alley = item as Alley
      valid.push({ id: alley.id, ...(alley.name ? { name: alley.name } : {}), coordinates: cleanLine(alley.coordinates), widthMeters: alley.widthMeters })
      return
    }
    const { id, name } = (item && typeof item === 'object' ? item : {}) as { id?: unknown; name?: unknown }
    invalid.push(item)
    problems.push({ index, ...(typeof id === 'string' && id ? { id } : {}), ...(typeof name === 'string' && name ? { name } : {}), reason })
  })
  return { valid, invalid, problems }
}

function readList(text: string): unknown[] | null {
  try {
    const value: unknown = JSON.parse(text)
    return Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

// 저장된 값이 규칙에 어긋나도 그 항목만 건너뛰어, 하나 때문에 지도 전체가 비지 않게 합니다.
async function readAlleys(env: MapEnv) {
  const row = await env.DB.prepare("SELECT alleys_json, dismissed_json, updated_at FROM map_alleys WHERE id = 'active'")
    .first<{ alleys_json: string; dismissed_json: string; updated_at: string }>()
  const list = row ? readList(row.alleys_json) : []
  const { valid, invalid, problems } = sortAlleys(list ?? [])
  if (!list) console.warn('저장된 골목길 목록을 읽지 못했습니다.')
  if (problems.length) console.warn(`저장된 골목길 ${problems.length}개가 규칙에 맞지 않아 건너뛰었습니다.`)
  return {
    alleys: valid,
    invalid,
    skipped: problems,
    damaged: !list,
    // 버린 후보는 후보를 다시 보여 줄지만 정하므로, 어긋난 항목은 보존하지 않습니다.
    dismissed: row ? (readList(row.dismissed_json) ?? []).filter((line) => lineProblem(line) === null).map((line) => cleanLine(line as LngLat[])) : [],
    updatedAt: row?.updated_at ?? null,
  }
}

// 공개 지도: 확인한 골목길만(GPS 기록·버린 후보·규칙에 어긋난 항목은 내보내지 않음)
export async function publicAlleys(env: MapEnv) {
  const { alleys, updatedAt } = await readAlleys(env)
  return json({ alleys, updatedAt }, { headers: { 'cache-control': 'public, max-age=60' } })
}

export async function adminAlleys(env: MapEnv) {
  const { alleys, skipped, damaged, dismissed, updatedAt } = await readAlleys(env)
  return json({ alleys, skipped, damaged, dismissed, updatedAt })
}

export async function saveAlleys(request: Request, env: MapEnv) {
  const body = await readJson(request)
  if (!Array.isArray(body?.alleys) || body.alleys.length > MAX_ALLEYS) return error(`골목길은 ${MAX_ALLEYS}개까지 저장할 수 있습니다.`, 400)
  const { valid: alleys, problems } = sortAlleys(body.alleys)
  if (problems.length) {
    const [first] = problems
    const more = problems.length > 1 ? ` (외 ${problems.length - 1}개)` : ''
    return json({ error: `${alleyLabel(first, first.index)}: ${first.reason}${more}`, problems }, { status: 400 })
  }
  const lines = body.dismissed ?? []
  if (!Array.isArray(lines) || lines.length > MAX_ALLEYS || lines.some((line) => lineProblem(line) !== null)) return error('버린 후보의 좌표가 올바르지 않습니다.', 400)
  const dismissed = (lines as LngLat[][]).map(cleanLine)

  // 편집 화면에 보이지 않는 어긋난 항목은 그대로 두어, 저장 한 번으로 영구히 사라지지 않게 합니다.
  const stored = await readAlleys(env)
  if (stored.damaged) return error('저장된 골목길 목록이 손상되어, 원본을 지키려고 저장을 막았습니다. 복구가 필요합니다.', 409)
  await env.DB.prepare(`INSERT INTO map_alleys (id, alleys_json, dismissed_json, updated_at) VALUES ('active', ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET alleys_json = excluded.alleys_json, dismissed_json = excluded.dismissed_json, updated_at = CURRENT_TIMESTAMP`)
    .bind(JSON.stringify([...alleys, ...stored.invalid]), JSON.stringify(dismissed)).run()
  return json({ alleys, dismissed })
}

// GPS 기록(편집 앱에서 GPX로 올린 것). 관리자만 읽고 쓰며 공개 지도에는 나가지 않습니다.
export async function listTrails(env: MapEnv) {
  const { results } = await env.DB.prepare('SELECT id, started_at, points_json FROM gps_trails ORDER BY started_at')
    .all<{ id: string; started_at: string; points_json: string }>()
  return json({ trails: results.map((row) => ({ id: row.id, startedAt: row.started_at, points: JSON.parse(row.points_json) })) })
}

export async function saveTrail(request: Request, env: MapEnv) {
  const body = await readJson(request)
  if (!body || typeof body.id !== 'string' || !body.id || body.id.length > 80 || typeof body.startedAt !== 'string'
    || Number.isNaN(Date.parse(body.startedAt)) || !Array.isArray(body.points) || body.points.length > MAX_TRAIL_POINTS) {
    return error(`기록 형식이 맞지 않거나 너무 깁니다(최대 ${MAX_TRAIL_POINTS}점).`, 400)
  }
  // 감천 작업 범위 밖의 점은 저장하지 않습니다.
  const kept: TrailPoint[] = body.points.flatMap((point: unknown) => {
    if (!Array.isArray(point) || point.length !== 4 || !point.every((part) => typeof part === 'number' && Number.isFinite(part))) return []
    const [lng, lat, accuracy, time] = point as TrailPoint
    return insideWorkArea(lng, lat) ? [[round7(lng), round7(lat), Math.round(accuracy * 10) / 10, Math.round(time)] as TrailPoint] : []
  })
  if (kept.length < 5) return error('감천 작업 범위 안에서 기록한 위치가 너무 적습니다.', 400)
  // 개인정보를 줄이기 위해 시각은 절대 시각이 아니라 첫 점부터의 경과(ms)로, 시작 시각은 날짜만 남깁니다.
  // 골목 추출(cleanTrail)은 점 사이의 시간 차이만 쓰므로 결과는 같습니다.
  const first = Math.min(...kept.map((point) => point[3]))
  const points: TrailPoint[] = kept.map(([lng, lat, accuracy, time]) => [lng, lat, accuracy, time - first])
  const startedAt = new Date(body.startedAt).toISOString().slice(0, 10)
  await env.DB.prepare(`INSERT INTO gps_trails (id, started_at, points_json) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET points_json = excluded.points_json`)
    .bind(body.id, startedAt, JSON.stringify(points)).run()
  return json({ trail: { id: body.id, startedAt, points } })
}

export async function deleteTrail(url: URL, env: MapEnv) {
  const id = url.searchParams.get('id')
  if (!id) return error('지울 기록을 알려주세요.', 400)
  await env.DB.prepare('DELETE FROM gps_trails WHERE id = ?').bind(id).run()
  return json({ ok: true })
}

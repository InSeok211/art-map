import type { Env } from './env'
import { error, json, readJson } from './http'
import { EMPTY_BUILDING_EDITS, sanitizeBuildingEdits } from '../src/buildings/buildingEdits'
import type { BuildingEdits } from '../src/buildings/buildingEdits'

// 편집 앱 '건물' 탭에서 고친 지도 건물입니다. 초안(draft, 편집 앱에서만 보임)과 공개본(published, 공개 지도) 두 벌을
// 두고, '공개하기'로 초안을 공개본에 옮깁니다. 받은 값은 편집 앱과 같은 규칙(buildingEdits.ts)으로 정리해 저장합니다.
type Version = 'draft' | 'published'

async function read(env: Env, id: Version) {
  const row = await env.DB.prepare('SELECT edits_json, updated_at FROM map_building_edits WHERE id = ?').bind(id)
    .first<{ edits_json: string; updated_at: string }>()
  return { edits: row ? sanitizeBuildingEdits(JSON.parse(row.edits_json)) : EMPTY_BUILDING_EDITS, updatedAt: row?.updated_at ?? null, exists: Boolean(row) }
}

async function write(env: Env, id: Version, edits: BuildingEdits) {
  await env.DB.prepare(`INSERT INTO map_building_edits (id, edits_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET edits_json = excluded.edits_json, updated_at = CURRENT_TIMESTAMP`)
    .bind(id, JSON.stringify(edits)).run()
}

export async function readBothVersions(env: Env) {
  const [draft, published] = await Promise.all([read(env, 'draft'), read(env, 'published')])
  // 초안을 한 번도 저장하지 않았으면 공개본을 초안으로 씁니다.
  return { draft: draft.exists ? draft.edits : published.edits, published: published.edits, draftUpdatedAt: draft.updatedAt, publishedAt: published.updatedAt }
}

export const readPublished = async (env: Env) => (await read(env, 'published')).edits

export async function publicBuildings(env: Env) {
  const published = await read(env, 'published')
  return json({ edits: published.edits, publishedAt: published.updatedAt })
}

export const adminBuildings = async (env: Env) => json(await readBothVersions(env))

export async function saveDraft(request: Request, env: Env) {
  const body = await readJson(request)
  const input = body?.draft as Partial<BuildingEdits> | undefined
  if (!input || typeof input.overrides !== 'object' || !input.overrides || Array.isArray(input.overrides)
    || !Array.isArray(input.added) || !Array.isArray(input.models)) {
    return error('건물 초안 형식이 잘못되었습니다. 기존 초안은 유지됩니다.', 400)
  }
  const draft = sanitizeBuildingEdits(input)
  if (Object.keys(draft.overrides).length !== Object.keys(input.overrides).length
    || draft.added.length !== input.added.length || draft.models.length !== input.models.length
    || new Set(draft.added.map((building) => building.id)).size !== draft.added.length
    || new Set(draft.models.map((model) => model.id)).size !== draft.models.length) {
    return error('저장할 수 없는 건물 데이터나 중복 ID가 있습니다. 기존 초안은 유지됩니다.', 400)
  }
  await write(env, 'draft', draft)
  return json({ draft })
}

export async function publish(env: Env) {
  const { draft } = await readBothVersions(env)
  await write(env, 'published', draft)
  return json({ published: draft })
}

export async function discard(env: Env) {
  const published = await readPublished(env)
  await write(env, 'draft', published)
  return json({ draft: published })
}

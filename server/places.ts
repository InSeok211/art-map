import type { MapEnv } from './env'
import { error, json, readJson } from './http'
import { MAP_AMENITIES } from '../src/data/mapAmenities'
import { cleanMapPlaces } from '../src/places/mapPlaces'
import { isInsideGamcheonMap } from '../src/map/gamcheonBoundary'

const defaults = MAP_AMENITIES.filter(p => isInsideGamcheonMap(p.longitude, p.latitude))

export async function readPlaces(env: MapEnv) {
  const row = await env.DB.prepare("SELECT places_json FROM map_places WHERE id = 'active'").first<{ places_json: string }>()
  return json({ places: row ? cleanMapPlaces(JSON.parse(row.places_json)) ?? defaults : defaults })
}

export async function savePlaces(request: Request, env: MapEnv) {
  const body = await readJson(request)
  const places = cleanMapPlaces(body?.places)
  if (!places) return error('장소 이름·분류·지도 안의 위치를 확인해 주세요.', 400)
  await env.DB.prepare(`INSERT INTO map_places (id, places_json, updated_at) VALUES ('active', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET places_json = excluded.places_json, updated_at = CURRENT_TIMESTAMP`)
    .bind(JSON.stringify(places)).run()
  return json({ places })
}

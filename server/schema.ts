import type { MapEnv } from './env'

// 지도 표가 없으면 만듭니다(새 데이터베이스나 내 PC 확인용). 표 모양은 migrations/0001_map_data.sql과 같고,
// 한 번 확인하면 서버가 다시 시작할 때까지 다시 묻지 않습니다.
let ready: Promise<unknown> | null = null
export function ensureMapTables(env: Pick<MapEnv, 'DB'>) {
  ready ??= env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS map_places (
      id TEXT PRIMARY KEY NOT NULL DEFAULT 'active', places_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS map_alleys (
      id TEXT PRIMARY KEY NOT NULL DEFAULT 'active', alleys_json TEXT NOT NULL,
      dismissed_json TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS gps_trails (
      id TEXT PRIMARY KEY NOT NULL, started_at TEXT NOT NULL, points_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS map_building_edits (
      id TEXT PRIMARY KEY NOT NULL CHECK (id IN ('draft', 'published')), edits_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
  ]).catch((cause) => { ready = null; throw cause })
  return ready
}

// 테스트에서 다시 확인하게 합니다.
export const resetMapTablesForTest = () => { ready = null }

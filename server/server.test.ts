import { describe, expect, it } from 'vitest'
import { handleApi } from './index'
import type { MapEnv } from './env'
import { resetMapTablesForTest } from './schema'

// D1 대신 쓰는 아주 작은 가짜 데이터베이스(표 만들기와 빈 읽기만 흉내 냄)
function fakeDb() {
  const statement = () => ({
    bind() { return this },
    async first() { return null },
    async run() { return {} },
    async all() { return { results: [] } },
  })
  return { prepare: statement, async batch() { return [] } }
}

function testEnv(admin = false) {
  resetMapTablesForTest()
  return { DB: fakeDb(), MODELS: {}, isAdmin: async () => admin } as unknown as MapEnv
}

const request = (path: string, init: RequestInit = {}) => new Request(`https://map.test${path}`, init)

describe('api routing', () => {
  it('requires a homepage admin for admin data', async () => {
    expect((await handleApi(request('/api/admin/map-alleys'), testEnv())).status).toBe(403)
    expect((await handleApi(request('/api/admin/map-alleys'), testEnv(true))).status).toBe(200)
  })

  it('lets anyone read the public map data', async () => {
    const response = await handleApi(request('/api/map-buildings'), testEnv())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ edits: { overrides: {}, added: [], models: [] } })
  })

  it('refuses changes sent from another site', async () => {
    const response = await handleApi(request('/api/admin/map-alleys', { method: 'PUT', headers: { origin: 'https://evil.test' }, body: '{}' }), testEnv(true))
    expect(response.status).toBe(403)
    expect((await response.json() as { error: string }).error).toMatch(/이 사이트 화면/)
  })

  it('answers unknown addresses and methods', async () => {
    expect((await handleApi(request('/api/nothing'), testEnv())).status).toBe(404)
    expect((await handleApi(request('/api/map-alleys', { method: 'DELETE', headers: { origin: 'https://map.test' } }), testEnv())).status).toBe(405)
  })
})

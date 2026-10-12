import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './password'
import { handleApi } from './index'
import { isAdmin, login } from './auth'
import type { Env } from './env'

// D1 대신 쓰는 아주 작은 가짜 데이터베이스(로그인 실패 기록만 흉내 냄)
function fakeDb() {
  const failures = new Map<string, { count: number; first_at: number }>()
  return {
    failures,
    prepare(sql: string) {
      let values: unknown[] = []
      return {
        bind(...args: unknown[]) { values = args; return this },
        async first() {
          if (sql.startsWith('SELECT count')) return failures.get(values[0] as string) ?? null
          return null
        },
        async run() {
          if (sql.startsWith('INSERT INTO login_failures')) {
            const key = values[0] as string, now = values[1] as number
            const row = failures.get(key)
            failures.set(key, row ? { count: row.count + 1, first_at: row.first_at } : { count: 1, first_at: now })
          }
          if (sql.startsWith('DELETE FROM login_failures')) failures.delete(values[0] as string)
          return {}
        },
        async all() { return { results: [] } },
      }
    },
  }
}

async function testEnv() {
  return {
    DB: fakeDb(),
    ADMIN_USERNAME: 'test-admin',
    ADMIN_PASSWORD_HASH: await hashPassword('correct horse battery'),
    SESSION_SECRET: 'x'.repeat(40),
  } as unknown as Env & { DB: ReturnType<typeof fakeDb> }
}

const request = (path: string, init: RequestInit = {}) => new Request(`https://map.test${path}`, init)

describe('admin password', () => {
  it('verifies only the right password', async () => {
    const stored = await hashPassword('correct horse battery')
    expect(stored).toMatch(/^pbkdf2-sha256\$100000\$/)
    expect(await verifyPassword('correct horse battery', stored)).toBe(true)
    expect(await verifyPassword('wrong', stored)).toBe(false)
    expect(await verifyPassword('correct horse battery', 'sha256$abc')).toBe(false)
  })
})

describe('admin login', () => {
  it('signs in with the right credentials and the cookie proves it', async () => {
    const env = await testEnv()
    const response = await login(request('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: 'test-admin', password: 'correct horse battery' }) }), env)
    expect(response.status).toBe(200)
    const cookie = response.headers.get('set-cookie')!
    expect(cookie).toMatch(/HttpOnly; Secure; SameSite=Strict/)
    const token = cookie.split(';')[0]
    expect(await isAdmin(request('/', { headers: { cookie: token } }), env)).toBe(true)
    // 서명을 바꾼 쿠키는 통과하지 못합니다.
    expect(await isAdmin(request('/', { headers: { cookie: `${token.slice(0, -2)}xx` } }), env)).toBe(false)
  })

  it('blocks after five wrong tries from the same place', async () => {
    const env = await testEnv()
    const wrong = () => login(request('/api/admin/login', { method: 'POST', headers: { 'cf-connecting-ip': '1.2.3.4' }, body: JSON.stringify({ username: 'test-admin', password: 'nope' }) }), env)
    for (let i = 0; i < 5; i++) expect((await wrong()).status).toBe(401)
    expect((await wrong()).status).toBe(429)
  })

  it('refuses to sign in when no password is set', async () => {
    const env = { ...(await testEnv()), ADMIN_PASSWORD_HASH: undefined }
    expect((await login(request('/api/admin/login', { method: 'POST', body: '{}' }), env)).status).toBe(503)
  })
})

describe('api routing', () => {
  it('requires an admin for admin data', async () => {
    const env = await testEnv()
    const response = await handleApi(request('/api/admin/map-alleys'), env, new URL('https://map.test/api/admin/map-alleys'))
    expect(response.status).toBe(403)
  })

  it('refuses changes sent from another site', async () => {
    const env = await testEnv()
    const url = new URL('https://map.test/api/admin/map-alleys')
    const response = await handleApi(request(url.pathname, { method: 'PUT', headers: { origin: 'https://evil.test' }, body: '{}' }), env, url)
    expect(response.status).toBe(403)
    expect((await response.json() as { error: string }).error).toMatch(/이 앱 화면/)
  })

  it('answers unknown addresses and methods', async () => {
    const env = await testEnv()
    expect((await handleApi(request('/api/nothing'), env, new URL('https://map.test/api/nothing'))).status).toBe(404)
    expect((await handleApi(request('/api/map-alleys', { method: 'DELETE', headers: { origin: 'https://map.test' } }), env, new URL('https://map.test/api/map-alleys'))).status).toBe(405)
  })
})

describe('open editing', () => {
  it('lets anyone edit without a login when OPEN_EDITING is true', async () => {
    const env = { ...await testEnv(), OPEN_EDITING: 'true' } as Env
    expect(await isAdmin(request('/api/admin/map-buildings'), env)).toBe(true)
    expect(await isAdmin(request('/api/admin/map-buildings'), { ...env, OPEN_EDITING: 'false' })).toBe(false)
  })
})

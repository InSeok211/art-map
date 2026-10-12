import type { Env } from './env'
import { error, json, readJson } from './http'
import { constantTimeEqual, verifyPassword } from './password'

// 편집 앱(/studio/) 관리자 로그인입니다. 관리자 한 명의 아이디·비밀번호 해시를 비밀값으로 두고, 로그인하면 서명한
// 세션 쿠키(8시간)를 줍니다. 같은 곳(IP)에서 15분 안에 5번 틀리면 15분 동안 로그인을 막습니다.
const COOKIE = 'map_admin'
const SESSION_SECONDS = 60 * 60 * 8
const MAX_FAILURES = 5
const FAILURE_WINDOW_MS = 15 * 60_000

const encoder = new TextEncoder()
const base64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
const fromBase64Url = (text: string) => Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((text.length + 3) % 4)), (char) => char.charCodeAt(0))

async function sign(secret: string, value: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)))
}

const digest = async (text: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)))

const configured = (env: Env) => Boolean(env.ADMIN_USERNAME && env.ADMIN_PASSWORD_HASH && env.SESSION_SECRET && env.SESSION_SECRET.length >= 32)

function readCookie(request: Request, name: string) {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return ''
}

// 로그인한 관리자인지 확인합니다.
export async function isAdmin(request: Request, env: Env) {
  if (!configured(env)) return false
  const [payload, signature] = readCookie(request, COOKIE).split('.')
  if (!payload || !signature) return false
  try {
    if (!constantTimeEqual(await sign(env.SESSION_SECRET!, payload), fromBase64Url(signature))) return false
    const session = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as { user?: string; expires?: number }
    return session.user === env.ADMIN_USERNAME && typeof session.expires === 'number' && session.expires > Date.now() / 1000
  } catch {
    return false
  }
}

const cookie = (value: string, maxAge: number) => `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`

async function failureCount(env: Env, key: string) {
  const row = await env.DB.prepare('SELECT count, first_at FROM login_failures WHERE key = ?').bind(key).first<{ count: number; first_at: number }>()
  return row && Date.now() - row.first_at < FAILURE_WINDOW_MS ? row.count : 0
}

async function recordFailure(env: Env, key: string) {
  const now = Date.now()
  await env.DB.prepare(`INSERT INTO login_failures (key, count, first_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN ? - first_at < ? THEN count + 1 ELSE 1 END,
      first_at = CASE WHEN ? - first_at < ? THEN first_at ELSE ? END`)
    .bind(key, now, now, FAILURE_WINDOW_MS, now, FAILURE_WINDOW_MS, now).run()
}

export async function login(request: Request, env: Env) {
  if (!configured(env)) return error('관리자 비밀번호가 아직 설정되지 않았습니다(npm run admin:password).', 503)
  const key = `ip:${request.headers.get('cf-connecting-ip') ?? 'local'}`
  if (await failureCount(env, key) >= MAX_FAILURES) return error('로그인을 여러 번 틀려 15분 동안 막았습니다. 잠시 뒤 다시 시도해 주세요.', 429)
  const body = await readJson(request)
  const username = typeof body?.username === 'string' ? body.username : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  // 아이디가 틀려도 비밀번호 확인을 똑같이 해서, 걸리는 시간으로 아이디를 알아낼 수 없게 합니다.
  const passwordOk = await verifyPassword(password, env.ADMIN_PASSWORD_HASH!)
  const userOk = constantTimeEqual(await digest(username), await digest(env.ADMIN_USERNAME!))
  if (!passwordOk || !userOk) {
    await recordFailure(env, key)
    return error('아이디나 비밀번호가 맞지 않습니다.', 401)
  }
  await env.DB.prepare('DELETE FROM login_failures WHERE key = ?').bind(key).run()
  const payload = base64Url(encoder.encode(JSON.stringify({ user: env.ADMIN_USERNAME, expires: Math.floor(Date.now() / 1000) + SESSION_SECONDS })))
  const token = `${payload}.${base64Url(await sign(env.SESSION_SECRET!, payload))}`
  return json({ ok: true }, { headers: { 'set-cookie': cookie(token, SESSION_SECONDS) } })
}

export const logout = () => json({ ok: true }, { headers: { 'set-cookie': cookie('', 0) } })

export async function session(request: Request, env: Env) {
  return json({ admin: await isAdmin(request, env), configured: configured(env) })
}

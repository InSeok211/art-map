import type { Env } from './env'
import { error, fromThisApp } from './http'
import { isAdmin, login, logout, session } from './auth'
import { adminAlleys, deleteTrail, listTrails, publicAlleys, saveAlleys, saveTrail } from './alleys'
import { adminBuildings, discard, publicBuildings, publish, saveDraft } from './buildings'
import { deleteModel, getModel, listModels, uploadModel } from './models'

// 감천 골목지도 앱 서버(Cloudflare Worker)입니다. 화면(공개 지도 /, 편집 앱 /studio/)은 빌드한 정적 파일로 주고,
// 지도 데이터는 /api/ 아래로 주고받습니다.
//  - /api/map-alleys, /api/map-buildings, /api/map-models/<번호>: 누구나 읽는 공개 지도용
//  - /api/admin/...: 편집 앱 관리자 전용(로그인 필요)
type Handler = (request: Request, env: Env, url: URL, params: string[]) => Promise<Response> | Response

const routes: [method: string, pattern: RegExp, admin: boolean, handler: Handler][] = [
  ['POST', /^\/api\/admin\/login$/, false, (request, env) => login(request, env)],
  ['POST', /^\/api\/admin\/logout$/, false, () => logout()],
  ['GET', /^\/api\/admin\/session$/, false, (request, env) => session(request, env)],

  ['GET', /^\/api\/map-alleys$/, false, (_request, env) => publicAlleys(env)],
  ['GET', /^\/api\/admin\/map-alleys$/, true, (_request, env) => adminAlleys(env)],
  ['PUT', /^\/api\/admin\/map-alleys$/, true, (request, env) => saveAlleys(request, env)],
  ['GET', /^\/api\/admin\/gps-trails$/, true, (_request, env) => listTrails(env)],
  ['POST', /^\/api\/admin\/gps-trails$/, true, (request, env) => saveTrail(request, env)],
  ['DELETE', /^\/api\/admin\/gps-trails$/, true, (_request, env, url) => deleteTrail(url, env)],

  ['GET', /^\/api\/map-buildings$/, false, (_request, env) => publicBuildings(env)],
  ['GET', /^\/api\/admin\/map-buildings$/, true, (_request, env) => adminBuildings(env)],
  ['PUT', /^\/api\/admin\/map-buildings$/, true, (request, env) => saveDraft(request, env)],
  ['POST', /^\/api\/admin\/map-buildings\/publish$/, true, (_request, env) => publish(env)],
  ['POST', /^\/api\/admin\/map-buildings\/discard$/, true, (_request, env) => discard(env)],

  ['GET', /^\/api\/map-models\/([\w-]+)$/, false, (request, env, _url, [id]) => getModel(id, request, env)],
  ['GET', /^\/api\/admin\/map-models$/, true, (_request, env) => listModels(env)],
  ['POST', /^\/api\/admin\/map-models$/, true, (request, env) => uploadModel(request, env)],
  ['DELETE', /^\/api\/admin\/map-models\/([\w-]+)$/, true, (_request, env, _url, [id]) => deleteModel(id, env)],
]

export async function handleApi(request: Request, env: Env, url: URL) {
  const matches = routes.filter(([, pattern]) => pattern.test(url.pathname))
  if (!matches.length) return error('없는 주소입니다.', 404)
  const route = matches.find(([method]) => method === request.method)
  if (!route) return error('지원하지 않는 요청입니다.', 405)
  const [, pattern, admin, handler] = route
  if (!fromThisApp(request, url)) return error('이 앱 화면에서 보낸 요청만 받습니다.', 403)
  if (admin && !await isAdmin(request, env)) return error('관리자로 로그인해 주세요.', 403)
  try {
    return await handler(request, env, url, pattern.exec(url.pathname)!.slice(1))
  } catch (cause) {
    console.error('api failed', request.method, url.pathname, cause)
    return error('처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.', 500)
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) return handleApi(request, env, url)
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>

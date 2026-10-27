import type { MapEnv } from './env'
import { error, fromThisApp } from './http'
import { adminAlleys, deleteTrail, listTrails, publicAlleys, saveAlleys, saveTrail } from './alleys'
import { adminBuildings, discard, publicBuildings, publish, saveDraft } from './buildings'
import { deleteModel, getModel, listModels, uploadModel } from './models'
import { deletePhoto, getPhoto, uploadPhoto } from './images'
import { ensureMapTables } from './schema'
import { readPlaces, savePlaces } from './places'
import { busArrivals } from './busArrivals'

export type { MapEnv } from './env'

// 감천 골목지도 API입니다. 홈페이지 서버(감천 작가 지도)가 아래 주소의 요청을 handleApi로 넘깁니다.
//  - /api/map-alleys, /api/map-buildings, /api/map-models/<번호>, /api/map-images/<번호>: 누구나 읽는 공개 지도용
//  - /api/admin/...: 편집 앱 전용(홈페이지 운영자 로그인 필요, env.isAdmin으로 확인)
type Handler = (request: Request, env: MapEnv, url: URL, params: string[]) => Promise<Response> | Response

const routes: [method: string, pattern: RegExp, admin: boolean, handler: Handler][] = [
  ['GET', /^\/api\/map-bus-arrivals$/, false, (_request, env, url) => busArrivals(env, url)],
  ['GET', /^\/api\/map-places$/, false, (_request, env) => readPlaces(env)],
  ['GET', /^\/api\/admin\/map-places$/, true, (_request, env) => readPlaces(env)],
  ['PUT', /^\/api\/admin\/map-places$/, true, (request, env) => savePlaces(request, env)],
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

  ['GET', /^\/api\/map-images\/([\w-]+)$/, false, (request, env, _url, [id]) => getPhoto(id, request, env)],
  ['POST', /^\/api\/admin\/map-images$/, true, (request, env) => uploadPhoto(request, env)],
  ['DELETE', /^\/api\/admin\/map-images\/([\w-]+)$/, true, (_request, env, _url, [id]) => deletePhoto(id, env)],
]

// 홈페이지가 넘겨줄 주소 목록입니다(이 주소들만 handleApi로 보내면 됩니다).
export const MAP_API_PATHS = routes.map(([, pattern]) => pattern.source)

export async function handleApi(request: Request, env: MapEnv, url = new URL(request.url)) {
  const matches = routes.filter(([, pattern]) => pattern.test(url.pathname))
  if (!matches.length) return error('없는 주소입니다.', 404)
  const route = matches.find(([method]) => method === request.method)
  if (!route) return error('지원하지 않는 요청입니다.', 405)
  const [, pattern, admin, handler] = route
  if (!fromThisApp(request, url)) return error('이 사이트 화면에서 보낸 요청만 받습니다.', 403)
  if (admin && !await env.isAdmin(request)) return error('운영자로 로그인해 주세요.', 403)
  try {
    await ensureMapTables(env)
    return await handler(request, env, url, pattern.exec(url.pathname)!.slice(1))
  } catch (cause) {
    console.error('map api failed', request.method, url.pathname, cause)
    return error('처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.', 500)
  }
}

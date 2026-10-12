import type { MapEnv } from './env'
import { error, json } from './http'
import { readBothVersions, readPublished } from './buildings'
import { checkGlb, MAX_GLB_BYTES } from '../src/buildings/glbCheck'
import { MODEL_FILE_ID } from '../src/buildings/buildingEdits'

// 편집 앱에서 올린 3D 모델(GLB) 파일입니다(R2 MODELS의 map-models/ 아래, 예전 홈페이지와 같은 자리). 올릴 때 편집 앱과 같은 규칙(glbCheck.ts)으로
// 다시 검사합니다. 공개 지도에 둔 모델은 누구나 받고, 아직 공개하지 않은 모델은 관리자만 받습니다.
const PREFIX = 'map-models/'
const isModelId = (value: unknown): value is string => typeof value === 'string' && MODEL_FILE_ID.test(value)
const modelKey = (id: string) => `${PREFIX}${id}.glb`
const newModelId = () => `m-${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`

export async function listModels(env: MapEnv) {
  const files: { id: string; name: string; size: number; uploaded: string }[] = []
  let cursor: string | undefined
  do {
    const page = await env.MODELS.list({ prefix: PREFIX, cursor })
    for (const object of page.objects) {
      const id = object.key.slice(PREFIX.length).replace(/\.glb$/, '')
      if (isModelId(id)) files.push({ id, name: object.customMetadata?.name || id, size: object.size, uploaded: object.uploaded.toISOString() })
    }
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  return json({ files: files.sort((a, b) => a.uploaded.localeCompare(b.uploaded)) })
}

export async function uploadModel(request: Request, env: MapEnv) {
  if (Number(request.headers.get('content-length') || 0) > MAX_GLB_BYTES + 64 * 1024) return error('파일이 너무 큽니다(최대 20MB).', 413)
  const form = await request.formData().catch(() => null)
  const file = form?.get('file') as unknown as File | string | null | undefined
  if (!file || typeof file === 'string' || !file.size) return error('GLB 파일을 골라 주세요.', 400)
  if (file.size > MAX_GLB_BYTES) return error('파일이 너무 큽니다(최대 20MB).', 413)
  const buffer = await file.arrayBuffer()
  const problem = checkGlb(buffer)
  if (problem) return error(problem, 400)
  const id = newModelId()
  const name = file.name.replace(/\.glb$/i, '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 80) || '모델'
  await env.MODELS.put(modelKey(id), buffer, { httpMetadata: { contentType: 'model/gltf-binary' }, customMetadata: { name } })
  return json({ file: { id, name, size: buffer.byteLength } })
}

// 초안이나 공개 지도에 둔 모델은 먼저 지도에서 지워야 파일을 지울 수 있습니다.
export async function deleteModel(id: string, env: MapEnv) {
  if (!isModelId(id)) return error('모델 번호가 맞지 않습니다.', 400)
  const { draft, published } = await readBothVersions(env)
  if (published.models.some((model) => model.modelId === id)) return error('공개 지도에 둔 모델입니다. 지도에서 지우고 공개한 뒤 지워 주세요.', 409)
  if (draft.models.some((model) => model.modelId === id)) return error('초안에 둔 모델입니다. 지도에서 먼저 지워 주세요.', 409)
  await env.MODELS.delete(modelKey(id))
  return json({ ok: true })
}

// 같은 번호의 파일은 바뀌지 않으므로(새로 올리면 새 번호) 공개 모델은 오래 캐시합니다.
export async function getModel(id: string, request: Request, env: MapEnv) {
  if (!isModelId(id)) return new Response('Not found', { status: 404 })
  const published = (await readPublished(env)).models.some((model) => model.modelId === id)
  if (!published && !await env.isAdmin(request)) return new Response('Not found', { status: 404 })
  const object = await env.MODELS.get(modelKey(id))
  if (!object) return new Response('Not found', { status: 404 })
  return new Response(object.body, {
    headers: {
      'content-type': 'model/gltf-binary',
      'cache-control': published ? 'public, max-age=86400' : 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

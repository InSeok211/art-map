import type { MapEnv } from './env'
import { error, json } from './http'
import { readPublished } from './buildings'
import { PHOTO_FILE_ID } from '../src/buildings/buildingEdits'

// 작가님 공방 장소 사진입니다(R2 MODELS의 map-images/ 아래). 편집 앱이 줄인 사진(JPEG)을 올리고, 공개 지도에 둔
// 사진은 누구나 받고, 아직 공개하지 않은 사진은 관리자만 받습니다.
const PREFIX = 'map-images/'
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024
const photoKey = (id: string) => `${PREFIX}${id}`
const newPhotoId = () => `i-${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`

// 파일 앞부분으로 사진 형식을 확인합니다(이름·브라우저가 알려 준 형식은 믿지 않음).
export function photoType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  const text = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end))
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'image/webp'
  return null
}

export async function uploadPhoto(request: Request, env: MapEnv) {
  if (Number(request.headers.get('content-length') || 0) > MAX_PHOTO_BYTES + 64 * 1024) return error('사진이 너무 큽니다(최대 2MB).', 413)
  const form = await request.formData().catch(() => null)
  const file = form?.get('file') as unknown as File | string | null | undefined
  if (!file || typeof file === 'string' || !file.size) return error('사진 파일을 골라 주세요.', 400)
  if (file.size > MAX_PHOTO_BYTES) return error('사진이 너무 큽니다(최대 2MB).', 413)
  const buffer = await file.arrayBuffer()
  const type = photoType(new Uint8Array(buffer, 0, Math.min(16, buffer.byteLength)))
  if (!type) return error('JPEG·PNG·WebP 사진만 올릴 수 있습니다.', 400)
  const id = newPhotoId()
  await env.MODELS.put(photoKey(id), buffer, { httpMetadata: { contentType: type } })
  return json({ photo: id })
}

// 같은 번호의 사진은 바뀌지 않으므로(새로 올리면 새 번호) 공개 사진은 오래 캐시합니다.
export async function getPhoto(id: string, request: Request, env: MapEnv) {
  if (!PHOTO_FILE_ID.test(id)) return new Response('Not found', { status: 404 })
  const published = (await readPublished(env)).workshop?.photo === id
  if (!published && !await env.isAdmin(request)) return new Response('Not found', { status: 404 })
  const object = await env.MODELS.get(photoKey(id))
  if (!object) return new Response('Not found', { status: 404 })
  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType ?? 'image/jpeg',
      'cache-control': published ? 'public, max-age=86400' : 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

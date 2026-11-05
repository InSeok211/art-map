import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleApi } from './index'
import type { MapEnv } from './env'
import { resetMapTablesForTest } from './schema'

// 지도 API를 공개 경계(handleApi)로만 시험합니다. DB는 D1과 같은 SQLite(메모리)라 실제 SQL과 표를 그대로 돌리고,
// R2는 쓰는 기능만 메모리로 흉내 냅니다. 저장 결과도 DB를 들여다보지 않고 API로 다시 읽어 확인합니다.
const ORIGIN = 'https://map.test'

function sqliteD1() {
  const db = new DatabaseSync(':memory:')
  const statement = (sql: string, args: unknown[] = []) => ({
    sql,
    args,
    bind: (...next: unknown[]) => statement(sql, next),
    first: async () => (db.prepare(sql).get(...(args as never[])) ?? null),
    all: async () => ({ results: db.prepare(sql).all(...(args as never[])) }),
    run: async () => {
      const { changes } = db.prepare(sql).run(...(args as never[]))
      return { meta: { changes: Number(changes) } }
    },
  })
  return {
    prepare: (sql: string) => statement(sql),
    batch: async (statements: ReturnType<typeof statement>[]) => Promise.all(statements.map((item) => item.run())),
  }
}

// 목록은 2개씩 나눠 돌려줘 이어 읽기(cursor)까지 함께 시험합니다.
function memoryBucket() {
  const objects = new Map<string, { body: ArrayBuffer; size: number; uploaded: Date; httpMetadata?: object; customMetadata?: Record<string, string> }>()
  return {
    keys: () => [...objects.keys()],
    async put(key: string, body: ArrayBuffer, options: { httpMetadata?: object; customMetadata?: Record<string, string> } = {}) {
      objects.set(key, { body, size: body.byteLength, uploaded: new Date(), ...options })
    },
    async get(key: string) { return objects.get(key) ?? null },
    async delete(keys: string | string[]) { for (const key of [keys].flat()) objects.delete(key) },
    async list({ prefix, cursor }: { prefix: string; cursor?: string }) {
      const all = [...objects].filter(([key]) => key.startsWith(prefix)).map(([key, object]) => ({ key, ...object }))
      const start = Number(cursor ?? 0)
      const end = start + 2
      return { objects: all.slice(start, end), truncated: end < all.length, cursor: String(end) }
    },
  }
}

// 운영자와 방문객이 같은 저장소를 보는 서버 하나를 만듭니다.
function server() {
  resetMapTablesForTest()
  const bucket = memoryBucket()
  const env = { DB: sqliteD1(), MODELS: bucket } as unknown as MapEnv
  const as = (admin: boolean) => (path: string, init: RequestInit = {}) => handleApi(
    new Request(`${ORIGIN}${path}`, { ...init, headers: { ...(init.method && init.method !== 'GET' ? { origin: ORIGIN } : {}), ...init.headers } }),
    { ...env, isAdmin: async () => admin },
  )
  return { admin: as(true), visitor: as(false), bucket }
}

const body = (value: unknown) => JSON.stringify(value)
const inArea: [number, number] = [129.009, 35.095]
const alley = { id: 'a1', name: '계단길', coordinates: [inArea, [129.0095, 35.0955]], widthMeters: 3 }

describe('골목길과 GPS 기록의 공개 범위', () => {
  it('공개 지도에는 확인한 골목길만 나가고 버린 후보는 나가지 않는다', async () => {
    const { admin, visitor } = server()
    const saved = await admin('/api/admin/map-alleys', { method: 'PUT', body: body({ alleys: [alley], dismissed: [alley.coordinates] }) })
    expect(saved.status).toBe(200)

    const shown = await (await visitor('/api/map-alleys')).json() as Record<string, unknown>
    expect(shown.alleys).toEqual([alley])
    expect(shown).not.toHaveProperty('dismissed')
    expect(await (await admin('/api/admin/map-alleys')).json()).toMatchObject({ alleys: [alley], dismissed: [alley.coordinates] })
  })

  it('작업 범위 밖 좌표가 하나라도 있으면 거부하고 저장된 골목길을 지킨다', async () => {
    const { admin, visitor } = server()
    await admin('/api/admin/map-alleys', { method: 'PUT', body: body({ alleys: [alley] }) })
    const outside = { ...alley, coordinates: [inArea, [127, 37.5]] }
    expect((await admin('/api/admin/map-alleys', { method: 'PUT', body: body({ alleys: [outside] }) })).status).toBe(400)
    expect(await (await visitor('/api/map-alleys')).json()).toMatchObject({ alleys: [alley] })
  })

  it('GPS 기록은 운영자만 볼 수 있고, 범위 밖 점과 절대 시각을 남기지 않는다', async () => {
    const { admin, visitor } = server()
    const start = Date.parse('2026-03-01T09:30:00Z')
    const point = (index: number): number[] => [129.009 + index / 10000, 35.095, 5, start + index * 1000]
    const trail = { id: 't1', startedAt: '2026-03-01T09:30:00Z', points: [[127, 37.5, 5, start - 5000], ...[0, 1, 2, 3, 4].map(point)] }
    expect((await admin('/api/admin/gps-trails', { method: 'POST', body: body(trail) })).status).toBe(200)

    expect((await visitor('/api/admin/gps-trails')).status).toBe(403)
    const { trails } = await (await admin('/api/admin/gps-trails')).json() as { trails: { id: string; startedAt: string; points: number[][] }[] }
    expect(trails).toHaveLength(1)
    expect(trails[0].startedAt).toBe('2026-03-01')
    expect(trails[0].points).toHaveLength(5)
    expect(trails[0].points.every(([lng]) => lng >= 129)).toBe(true)
    expect(trails[0].points.map((item) => item[3])).toEqual([0, 1000, 2000, 3000, 4000])

    expect((await admin('/api/admin/gps-trails?id=t1', { method: 'DELETE' })).status).toBe(200)
    expect(await (await admin('/api/admin/gps-trails')).json()).toEqual({ trails: [] })
  })

  it('범위 안 점이 너무 적은 기록은 저장하지 않는다', async () => {
    const { admin } = server()
    const trail = { id: 't1', startedAt: '2026-03-01T09:30:00Z', points: [[129.009, 35.095, 5, 0], [127, 37.5, 5, 1], [127, 37.5, 5, 2], [127, 37.5, 5, 3], [127, 37.5, 5, 4]] }
    expect((await admin('/api/admin/gps-trails', { method: 'POST', body: body(trail) })).status).toBe(400)
    expect(await (await admin('/api/admin/gps-trails')).json()).toEqual({ trails: [] })
  })
})

const override = (heightMeters: number) => ({ overrides: { 123: { heightMeters } }, added: [], models: [] })
const putDraft = (draft: unknown) => ({ method: 'PUT', body: body({ draft }) })

describe('건물 초안과 공개본', () => {
  it('초안은 공개하기 전까지 방문객에게 보이지 않고, 공개하면 보인다', async () => {
    const { admin, visitor } = server()
    expect((await admin('/api/admin/map-buildings', putDraft(override(12)))).status).toBe(200)
    const before = await (await visitor('/api/map-buildings')).json() as { edits: { overrides: object } }
    expect(before.edits.overrides).toEqual({})

    expect((await admin('/api/admin/map-buildings/publish', { method: 'POST' })).status).toBe(200)
    expect(await (await visitor('/api/map-buildings')).json()).toMatchObject({ edits: override(12) })
  })

  it('되돌리기는 초안을 공개본으로 돌리고 공개본은 바꾸지 않는다', async () => {
    const { admin, visitor } = server()
    await admin('/api/admin/map-buildings', putDraft(override(12)))
    await admin('/api/admin/map-buildings/publish', { method: 'POST' })
    await admin('/api/admin/map-buildings', putDraft(override(30)))

    expect((await admin('/api/admin/map-buildings/discard', { method: 'POST' })).status).toBe(200)
    expect(await (await admin('/api/admin/map-buildings')).json()).toMatchObject({ draft: override(12), published: override(12) })
    expect(await (await visitor('/api/map-buildings')).json()).toMatchObject({ edits: override(12) })
  })

  it('잘못된 초안은 거부하고 기존 초안을 지킨다', async () => {
    const { admin } = server()
    await admin('/api/admin/map-buildings', putDraft(override(12)))
    const placed = { id: 'p1', modelId: 'm-abcdef1234', name: '', longitude: inArea[0], latitude: inArea[1], rotation: 0, widthMeters: 10, replaces: [] }
    const bad = [
      { overrides: {}, added: [] },
      { ...override(30), overrides: { 'not-a-number': { heightMeters: 3 } } },
      { ...override(30), models: [placed, placed] },
      { ...override(30), models: [{ ...placed, longitude: 127 }] },
    ]
    for (const draft of bad) expect((await admin('/api/admin/map-buildings', putDraft(draft))).status).toBe(400)
    expect(await (await admin('/api/admin/map-buildings')).json()).toMatchObject({ draft: override(12) })
  })
})

function glb(gltf: object = { asset: { version: '2.0' }, meshes: [{}] }) {
  const encoded = new TextEncoder().encode(JSON.stringify(gltf).padEnd(64))
  const bytes = new Uint8Array(20 + encoded.length)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, bytes.length, true)
  view.setUint32(12, encoded.length, true)
  view.setUint32(16, 0x4e4f534a, true)
  bytes.set(encoded, 20)
  return bytes
}
const upload = (bytes: Uint8Array, name = 'file.glb') => {
  const form = new FormData()
  form.append('file', new File([bytes], name))
  return { method: 'POST', body: form }
}
const placedModel = (modelId: string) => ({ overrides: {}, added: [], models: [{ id: 'p1', modelId, name: '', longitude: inArea[0], latitude: inArea[1], rotation: 0, widthMeters: 10, replaces: [] }] })

describe('3D 모델 파일', () => {
  it('GLB가 아니거나 외부 파일을 불러오는 모델은 받지 않는다', async () => {
    const { admin, bucket } = server()
    const notGlb = await admin('/api/admin/map-models', upload(new TextEncoder().encode('<svg onload="alert(1)"></svg>'.padEnd(40))))
    expect(notGlb.status).toBe(400)
    const external = await admin('/api/admin/map-models', upload(glb({ asset: { version: '2.0' }, meshes: [{}], images: [{ uri: 'https://evil.test/x.png' }] })))
    expect(external.status).toBe(400)
    expect(bucket.keys()).toEqual([])
  })

  it('올린 모델은 목록에 나오고, 공개 전에는 운영자만 받을 수 있으며 캐시되지 않는다', async () => {
    const { admin, visitor } = server()
    const { file } = await (await admin('/api/admin/map-models', upload(glb(), '공방\u0000 건물.glb'))).json() as { file: { id: string; name: string } }
    expect(file.name).toBe('공방 건물')

    const { files } = await (await admin('/api/admin/map-models')).json() as { files: { id: string }[] }
    expect(files.map((item) => item.id)).toEqual([file.id])
    expect((await visitor('/api/admin/map-models')).status).toBe(403)

    expect((await visitor(`/api/map-models/${file.id}`)).status).toBe(404)
    const own = await admin(`/api/map-models/${file.id}`)
    expect(own.status).toBe(200)
    expect(own.headers.get('cache-control')).toBe('private, no-store')
  })

  it('공개한 모델은 누구나 받고 캐시된다', async () => {
    const { admin, visitor } = server()
    const { file } = await (await admin('/api/admin/map-models', upload(glb()))).json() as { file: { id: string } }
    await admin('/api/admin/map-buildings', putDraft(placedModel(file.id)))
    await admin('/api/admin/map-buildings/publish', { method: 'POST' })

    const shown = await visitor(`/api/map-models/${file.id}`)
    expect(shown.status).toBe(200)
    expect(shown.headers.get('cache-control')).toBe('public, max-age=3600')
  })

  it('목록이 여러 쪽이어도 모델을 빠뜨리지 않는다', async () => {
    const { admin } = server()
    for (let index = 0; index < 5; index++) await admin('/api/admin/map-models', upload(glb()))
    const { files } = await (await admin('/api/admin/map-models')).json() as { files: unknown[] }
    expect(files).toHaveLength(5)
  })

  it('초안이나 공개 지도에 둔 모델은 지울 수 없고, 지도에서 뺀 뒤에는 지울 수 있다', async () => {
    const { admin, bucket } = server()
    const { file } = await (await admin('/api/admin/map-models', upload(glb()))).json() as { file: { id: string } }
    await admin('/api/admin/map-buildings', putDraft(placedModel(file.id)))
    expect((await admin(`/api/admin/map-models/${file.id}`, { method: 'DELETE' })).status).toBe(409)

    await admin('/api/admin/map-buildings/publish', { method: 'POST' })
    await admin('/api/admin/map-buildings', putDraft(override(12)))
    expect((await admin(`/api/admin/map-models/${file.id}`, { method: 'DELETE' })).status).toBe(409)

    await admin('/api/admin/map-buildings/publish', { method: 'POST' })
    expect((await admin(`/api/admin/map-models/${file.id}`, { method: 'DELETE' })).status).toBe(200)
    expect(bucket.keys()).toEqual([])
  })
})

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])
const uploadPhoto = async (admin: ReturnType<typeof server>['admin']) => {
  const form = new FormData()
  form.append('file', new File([JPEG], 'workshop.jpg'))
  return (await (await admin('/api/admin/map-images', { method: 'POST', body: form })).json() as { photo: string }).photo
}
const withPhoto = (photo: string) => ({ overrides: {}, added: [], models: [], workshop: { photo } })

describe('공방 사진 정리', () => {
  it('방금 올렸지만 아직 초안에 넣지 않은 사진은 다른 저장 때문에 지워지지 않는다', async () => {
    const { admin } = server()
    const photo = await uploadPhoto(admin)
    // 사진을 올리는 사이에 앞선 수정의 자동 저장이 끝난 경우
    await admin('/api/admin/map-buildings', putDraft(override(12)))
    await admin('/api/admin/map-buildings', putDraft(withPhoto(photo)))
    expect((await admin(`/api/map-images/${photo}`)).status).toBe(200)
  })

  it('사진을 바꾼 뒤 저장돼도 실행 취소로 이전 사진을 되살릴 수 있다', async () => {
    const { admin } = server()
    const before = await uploadPhoto(admin)
    await admin('/api/admin/map-buildings', putDraft(withPhoto(before)))
    await admin('/api/admin/map-buildings', putDraft(withPhoto(await uploadPhoto(admin))))
    await admin('/api/admin/map-buildings', putDraft(withPhoto(before)))
    expect((await admin(`/api/map-images/${before}`)).status).toBe(200)
  })

  it('하루가 지나도 어디에도 쓰지 않는 사진은 다음 저장 때 지우고, 쓰는 사진은 남긴다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const { admin, bucket } = server()
    const used = await uploadPhoto(admin)
    const unused = await uploadPhoto(admin)
    await admin('/api/admin/map-buildings', putDraft(withPhoto(used)))

    vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000)
    await admin('/api/admin/map-buildings', putDraft(withPhoto(used)))
    expect(bucket.keys()).toEqual([`map-images/${used}`])
    expect(unused).not.toBe(used)
  })

  it('운영자가 직접 지우면 바로 지우되, 초안이나 공개 지도에 둔 사진은 지울 수 없다', async () => {
    const { admin, bucket } = server()
    const photo = await uploadPhoto(admin)
    await admin('/api/admin/map-buildings', putDraft(withPhoto(photo)))
    expect((await admin(`/api/admin/map-images/${photo}`, { method: 'DELETE' })).status).toBe(409)
    await admin('/api/admin/map-buildings', putDraft(override(12)))
    expect((await admin(`/api/admin/map-images/${photo}`, { method: 'DELETE' })).status).toBe(200)
    expect(bucket.keys()).toEqual([])
  })

  it('공개한 사진은 누구나 보고, 공개에서 내리면 방문객은 볼 수 없다', async () => {
    const { admin, visitor } = server()
    const photo = await uploadPhoto(admin)
    await admin('/api/admin/map-buildings', putDraft(withPhoto(photo)))
    expect((await visitor(`/api/map-images/${photo}`)).status).toBe(404)

    await admin('/api/admin/map-buildings/publish', { method: 'POST' })
    const shown = await visitor(`/api/map-images/${photo}`)
    expect(shown.status).toBe(200)
    expect(shown.headers.get('cache-control')).toBe('public, max-age=3600')

    await admin('/api/admin/map-buildings', putDraft(override(12)))
    await admin('/api/admin/map-buildings/publish', { method: 'POST' })
    expect((await visitor(`/api/map-images/${photo}`)).status).toBe(404)
  })
})

afterEach(() => { vi.useRealTimers() })

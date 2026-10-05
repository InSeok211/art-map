import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { Box3, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { ARTIST_WORKSHOP_MODEL, ARTIST_WORKSHOP_PLACE, refineArtistWorkshopPlace, removeUntouchedWorkshopModel, seedArtistWorkshopPlace } from './artistWorkshop'

describe('artist workshop map model', () => {
  it('drops only untouched default workshop GLBs now that the street scene draws the workshop', () => {
    const address = { longitude: 129.00930268855, latitude: 35.095522407839 }
    const other = { id: 'existing', assetId: 'rounded-house', longitude: 129.01, latitude: 35.097, widthMeters: 10, rotation: 0, altitudeMeters: 0 }
    const defaults = [
      { ...ARTIST_WORKSHOP_MODEL, longitude: 129.00925868855, latitude: address.latitude, widthMeters: 10.5, rotation: 0 },
      ...[[9.5, 0], [12.5, 0], [15.5, 90]].map(([widthMeters, rotation]) => ({ ...ARTIST_WORKSHOP_MODEL, ...address, widthMeters, rotation })),
      { ...ARTIST_WORKSHOP_MODEL, longitude: 129.00929761, latitude: 35.09548788 },
      { ...ARTIST_WORKSHOP_MODEL, longitude: 129.0092292, latitude: 35.0954356 },
      ARTIST_WORKSHOP_MODEL,
    ]
    for (const model of defaults) expect(removeUntouchedWorkshopModel([other, model])).toEqual([other])
    const edited = { ...ARTIST_WORKSHOP_MODEL, rotation: 21 }
    expect(removeUntouchedWorkshopModel([other, edited])).toEqual([other, edited])
    const unchanged = [other]
    expect(removeUntouchedWorkshopModel(unchanged)).toBe(unchanged)
  })

  it('loads a real GLB with the corner glazing, brick shell and roof rail', async () => {
    const path = new URL('./assets/models/custom/artist-workshop-180.glb', import.meta.url)
    const bytes = await readFile(path)
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    const gltf = await new GLTFLoader().parseAsync(buffer, '')
    const names = new Set<string>()
    gltf.scene.traverse((node) => { if (node.name) names.add(node.name) })
    expect(names.has('brick-shell')).toBe(true)
    expect(names.has('corner-glazing')).toBe(true)
    expect(names.has('roof-rail')).toBe(true)
    expect(names.has('side-door-left-leaf')).toBe(true)
    expect(names.has('side-door-right-leaf')).toBe(true)
    expect(names.has('upper-studio-walls')).toBe(true)
    const size = new Box3().setFromObject(gltf.scene).getSize(new Vector3())
    expect(size.x).toBeGreaterThan(8)
    expect(size.y).toBeGreaterThan(5)
    expect(size.z).toBeGreaterThan(5)
  })

  it('makes the workshop discoverable at the same address without restoring a deleted place', () => {
    const initial = [{ id: 'other', name: '다른 장소', category: 'shop' as const, longitude: 129.01, latitude: 35.097 }]
    const seeded = seedArtistWorkshopPlace(initial, false)
    expect(seeded).toHaveLength(2)
    expect(seeded[1]).toMatchObject({ name: '작가님 공방', address: '부산 사하구 옥천로101번길 23' })
    expect(ARTIST_WORKSHOP_PLACE.longitude).toBe(ARTIST_WORKSHOP_MODEL.longitude)
    expect(ARTIST_WORKSHOP_PLACE.latitude).toBe(ARTIST_WORKSHOP_MODEL.latitude)
    expect(seedArtistWorkshopPlace(initial, true)).toEqual(initial)
  })

  it('moves a workshop place left at the address point onto the workshop building only', () => {
    const atAddress = { ...ARTIST_WORKSHOP_PLACE, longitude: 129.00925868855, latitude: 35.095522407839, description: '직접 쓴 설명' }
    expect(refineArtistWorkshopPlace([atAddress])[0]).toEqual({
      ...atAddress, longitude: ARTIST_WORKSHOP_MODEL.longitude, latitude: ARTIST_WORKSHOP_MODEL.latitude,
    })
    for (const [longitude, latitude] of [[129.00929761, 35.09548788], [129.0092292, 35.0954356]]) {
      expect(refineArtistWorkshopPlace([{ ...atAddress, longitude, latitude }])[0]).toMatchObject({
        longitude: ARTIST_WORKSHOP_MODEL.longitude, latitude: ARTIST_WORKSHOP_MODEL.latitude,
      })
    }
    // 처음 넣었던 주소는 실제 공방 주소로 바꾸고, 사용자가 고친 주소는 그대로 둡니다.
    expect(refineArtistWorkshopPlace([{ ...atAddress, address: '부산 사하구 감내1로 180' }])[0].address)
      .toBe('부산 사하구 옥천로101번길 23')
    const custom = { ...ARTIST_WORKSHOP_PLACE, address: '직접 쓴 주소' }
    expect(refineArtistWorkshopPlace([custom])[0]).toBe(custom)
    const moved = { ...atAddress, longitude: 129.0095 }
    expect(refineArtistWorkshopPlace([moved])[0]).toEqual(moved)
    // 편집용 기본 설명은 방문자용 설명으로 바꾸고, 사용자가 쓴 설명은 그대로 둡니다.
    const oldDescription = { ...ARTIST_WORKSHOP_PLACE, description: '사진과 로드뷰를 참고해 만든 3D 건물 시안입니다. 위치·크기·회전을 수정할 수 있습니다.' }
    expect(refineArtistWorkshopPlace([oldDescription])[0].description).toBe(ARTIST_WORKSHOP_PLACE.description)
    const ownDescription = { ...ARTIST_WORKSHOP_PLACE, description: '직접 쓴 소개' }
    expect(refineArtistWorkshopPlace([ownDescription])[0]).toBe(ownDescription)
  })
})

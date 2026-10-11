import { describe, expect, it } from 'vitest'
import { checkGlb } from './glbCheck'

// 머리말 + JSON 덩어리만 있는 작은 GLB를 만듭니다(검사에는 도형 데이터가 필요 없음).
function glb(json: object, version = 2) {
  const text = new TextEncoder().encode(JSON.stringify(json))
  const padded = new Uint8Array(Math.ceil(text.length / 4) * 4).fill(0x20)
  padded.set(text)
  const buffer = new ArrayBuffer(20 + padded.length)
  const view = new DataView(buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, version, true)
  view.setUint32(8, buffer.byteLength, true)
  view.setUint32(12, padded.length, true)
  view.setUint32(16, 0x4e4f534a, true)
  new Uint8Array(buffer, 20).set(padded)
  return buffer
}
const mesh = { asset: { version: '2.0' }, meshes: [{ primitives: [] }] }

describe('GLB upload check', () => {
  it('accepts a self-contained glTF 2.0 binary', () => {
    expect(checkGlb(glb(mesh))).toBeNull()
    expect(checkGlb(glb({ ...mesh, images: [{ uri: 'data:image/png;base64,AA==' }] }))).toBeNull()
  })

  it('rejects other files, old versions and broken lengths', () => {
    expect(checkGlb(new TextEncoder().encode('{"asset":{"version":"2.0"}}----').buffer as ArrayBuffer)).toMatch(/GLB 파일이 아닙니다/)
    expect(checkGlb(glb(mesh, 1))).toMatch(/2\.0/)
    expect(checkGlb(glb(mesh).slice(0, 30))).toMatch(/손상/)
  })

  it('rejects external links, unsupported compression and empty models', () => {
    expect(checkGlb(glb({ ...mesh, images: [{ uri: 'https://example.com/a.png' }] }))).toMatch(/다른 파일/)
    expect(checkGlb(glb({ ...mesh, buffers: [{ uri: 'model.bin', byteLength: 4 }] }))).toMatch(/다른 파일/)
    expect(checkGlb(glb({ ...mesh, extensionsRequired: ['KHR_draco_mesh_compression'] }))).toMatch(/압축/)
    expect(checkGlb(glb({ asset: { version: '2.0' } }))).toMatch(/도형이 없습니다/)
  })
})

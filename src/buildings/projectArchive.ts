const encoder = new TextEncoder(), decoder = new TextDecoder()
export const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit++) value = value >>> 1 ^ (value & 1 ? 0xedb88320 : 0)
  return value >>> 0
})
export function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = crc >>> 8 ^ crcTable[(crc ^ byte) & 255]
  return (crc ^ 0xffffffff) >>> 0
}
const safePath = (name: string) => /^[a-zA-Z0-9_.\-/]+$/.test(name) && !name.startsWith('/') && !name.split('/').includes('..')

// 텍스처가 포함된 GLB는 이미 묶인 파일이므로, 추가 의존성 없이 저장 방식 ZIP으로 내보냅니다.
export async function createArchive(files: { name: string; data: Blob }[]) {
  if (files.length > 110 || files.reduce((sum, file) => sum + file.data.size, 0) > MAX_ARCHIVE_BYTES) throw new Error('백업은 200MB, 파일 110개까지 지원합니다.')
  const parts: BlobPart[] = [], central: BlobPart[] = []
  let offset = 0, centralSize = 0
  const names = new Set<string>()
  for (const file of files) {
    if (!safePath(file.name) || names.has(file.name)) throw new Error('백업 파일 경로가 잘못되었거나 중복되었습니다.')
    names.add(file.name)
    const name = encoder.encode(file.name), crc = crc32(new Uint8Array(await file.data.arrayBuffer()))
    const header = new ArrayBuffer(30), local = new DataView(header)
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x800, true)
    local.setUint16(12, 0x21, true); local.setUint32(14, crc, true); local.setUint32(18, file.data.size, true)
    local.setUint32(22, file.data.size, true); local.setUint16(26, name.length, true)
    parts.push(header, name.buffer as ArrayBuffer, file.data)
    const directory = new ArrayBuffer(46), view = new DataView(directory)
    view.setUint32(0, 0x02014b50, true); view.setUint16(4, 20, true); view.setUint16(6, 20, true); view.setUint16(8, 0x800, true)
    view.setUint16(14, 0x21, true); view.setUint32(16, crc, true); view.setUint32(20, file.data.size, true)
    view.setUint32(24, file.data.size, true); view.setUint16(28, name.length, true); view.setUint32(42, offset, true)
    central.push(directory, name.buffer as ArrayBuffer); centralSize += 46 + name.length
    offset += 30 + name.length + file.data.size
  }
  const end = new ArrayBuffer(22), view = new DataView(end)
  view.setUint32(0, 0x06054b50, true); view.setUint16(8, files.length, true); view.setUint16(10, files.length, true)
  view.setUint32(12, centralSize, true); view.setUint32(16, offset, true)
  return new Blob([...parts, ...central, end], { type: 'application/zip' })
}

export async function readArchive(file: Blob): Promise<Map<string, Uint8Array>> {
  if (file.size > MAX_ARCHIVE_BYTES + 64 * 1024 || file.size < 22) throw new Error('백업 파일 크기가 잘못되었습니다(최대 200MB).')
  const buffer = await file.arrayBuffer(), view = new DataView(buffer), bytes = new Uint8Array(buffer)
  const end = bytes.length - 22
  if (view.getUint32(end, true) !== 0x06054b50 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)
    || view.getUint16(end + 20, true)) throw new Error('이 편집기가 내보낸 백업 ZIP을 선택하세요.')
  const count = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true)
  let cursor = view.getUint32(end + 16, true)
  if (count > 110 || cursor + size !== end) throw new Error('손상된 백업 ZIP입니다.')
  const result = new Map<string, Uint8Array>()
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) throw new Error('손상된 백업 파일 목록입니다.')
    const flags = view.getUint16(cursor + 8, true), method = view.getUint16(cursor + 10, true)
    const crc = view.getUint32(cursor + 16, true), length = view.getUint32(cursor + 24, true)
    const nameLength = view.getUint16(cursor + 28, true), extra = view.getUint16(cursor + 30, true), comment = view.getUint16(cursor + 32, true)
    const local = view.getUint32(cursor + 42, true)
    if (method || flags & 1 || length !== view.getUint32(cursor + 20, true) || cursor + 46 + nameLength + extra + comment > end)
      throw new Error('압축되거나 손상된 백업은 지원하지 않습니다.')
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength))
    if (!safePath(name) || result.has(name) || local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50)
      throw new Error('백업 파일 경로가 잘못되었습니다.')
    const localNameLength = view.getUint16(local + 26, true), localExtra = view.getUint16(local + 28, true)
    const start = local + 30 + localNameLength + localExtra
    if (start + length > view.getUint32(end + 16, true)
      || decoder.decode(bytes.subarray(local + 30, local + 30 + localNameLength)) !== name) throw new Error('백업 파일이 손상되었습니다.')
    const data = bytes.subarray(start, start + length)
    if (crc32(data) !== crc) throw new Error(`백업 파일이 손상되었습니다: ${name}`)
    result.set(name, data)
    cursor += 46 + nameLength + extra + comment
  }
  if (cursor !== end) throw new Error('백업 파일 목록이 손상되었습니다.')
  return result
}

// GLB 내보내기 스크립트(build-greenhouse-from-plan.mjs, build-beautiful-hangul.mjs)가 함께 쓰는 Node용 브라우저 대체물입니다.
// three.js의 GLTFExporter는 FileReader·ImageData·canvas가 있다고 가정하므로, 최소한만 흉내 내고 캔버스 내용은 PNG로 직접 인코딩합니다.
// (예전에는 각 스크립트가 같은 코드를 복사해 두고 있었습니다.)
import { deflateSync } from 'node:zlib'

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0)
  return value >>> 0
})

export function pngChunk(type, data) {
  const label = Buffer.from(type), chunk = Buffer.alloc(12 + data.length)
  chunk.writeUInt32BE(data.length, 0); label.copy(chunk, 4); data.copy(chunk, 8)
  let crc = 0xffffffff
  for (let i = 4; i < 8 + data.length; i++) crc = crcTable[(crc ^ chunk[i]) & 255] ^ (crc >>> 8)
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + data.length)
  return chunk
}

/** RGBA 픽셀(Uint8ClampedArray/Uint8Array)을 8비트 RGBA PNG 버퍼로 만듭니다. */
export function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6
  const rows = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(rows, y * (1 + width * 4) + 1)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(rows)), pngChunk('IEND', Buffer.alloc(0))])
}

/** GLTFExporter가 쓰는 FileReader·ImageData·document.createElement('canvas')를 전역에 설치합니다(이미 있으면 그대로 둠). */
export function installCanvasShims() {
  globalThis.FileReader ??= class {
    result = null
    onloadend = null
    readAsArrayBuffer(blob) { blob.arrayBuffer().then((value) => { this.result = value; this.onloadend?.() }) }
    readAsDataURL(blob) { blob.arrayBuffer().then((value) => { this.result = `data:${blob.type};base64,${Buffer.from(value).toString('base64')}`; this.onloadend?.() }) }
  }
  globalThis.ImageData ??= class { constructor(data, width, height) { this.data = data; this.width = width; this.height = height } }
  globalThis.document ??= {
    createElement(kind) {
      if (kind !== 'canvas') throw new Error(`Unsupported DOM node: ${kind}`)
      const canvas = { width: 1, height: 1, pixels: null }
      const context = { translate() {}, scale() {}, putImageData(image) { canvas.pixels = image.data } }
      canvas.getContext = () => context
      canvas.toBlob = (callback) => callback(new Blob([encodePng(canvas.width, canvas.height, canvas.pixels)], { type: 'image/png' }))
      return canvas
    },
  }
}

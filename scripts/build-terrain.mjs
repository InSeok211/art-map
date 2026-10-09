// 거리 장면의 지형 높이 표를 만들어 src/generated/terrain.json에 저장합니다.
// 사용법: npm run build:terrain
//
// 고도: AWS Open Data의 Terrain Tiles(Mapzen/Tilezen, terrarium 형식). 한국은 SRTM·GMTED2010(미국 지질조사국,
// 퍼블릭 도메인)과 ETOPO1(NOAA) 자료로 만들어져 출처 표기만 하면 됩니다(NOTICE.md). 공개 지도의 'MapLibre 지형'도
// 같은 타일을 쓰므로, 여기서 같은 줌(15)의 타일을 읽어 장면 미터 격자(8m)로 옮겨 두면 3D 장면과 바탕 지형이 맞습니다.
import { writeFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'
import { build } from 'rolldown'

export const TERRAIN_TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
const ZOOM = 15
const CELL = 8
const PADDING = 120

const outfile = 'node_modules/.cache/gamcheon-map/terrain-entry.mjs'
await build({ input: 'scripts/terrain-entry.ts', platform: 'node', logLevel: 'warn', output: { file: outfile, format: 'esm' } })
const { getStreetSceneBounds, STREET_ORIGIN } = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`)

const M_LAT = 111_320
const M_LON = M_LAT * Math.cos(STREET_ORIGIN[1] * Math.PI / 180)
const toLngLat = (x, z) => [STREET_ORIGIN[0] + x / M_LON, STREET_ORIGIN[1] - z / M_LAT]

// 8비트 RGB/RGBA, 비월주사 없는 PNG만 읽습니다(terrarium 타일 형식).
function decodePng(buffer) {
  let offset = 8, width = 0, height = 0, channels = 3
  const data = []
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const body = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4)
      if (body[8] !== 8 || body[12] !== 0 || ![2, 6].includes(body[9])) throw new Error('지원하지 않는 PNG 형식')
      channels = body[9] === 6 ? 4 : 3
    } else if (type === 'IDAT') data.push(body)
    offset += length + 12
  }
  const raw = inflateSync(Buffer.concat(data))
  const stride = width * channels
  const pixels = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x]
      const left = x >= channels ? pixels[y * stride + x - channels] : 0
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0
      let predicted = 0
      if (filter === 1) predicted = left
      else if (filter === 2) predicted = up
      else if (filter === 3) predicted = (left + up) >> 1
      else if (filter === 4) {
        const p = left + up - upLeft, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft)
        predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft
      }
      pixels[y * stride + x] = (value + predicted) & 255
    }
  }
  return { width, height, channels, pixels }
}

const tiles = new Map()
async function tile(x, y) {
  const key = `${x}/${y}`
  if (!tiles.has(key)) {
    const response = await fetch(TERRAIN_TILE_URL.replace('{z}', ZOOM).replace('{x}', x).replace('{y}', y))
    if (!response.ok) throw new Error(`고도 타일 ${key}: ${response.status}`)
    tiles.set(key, decodePng(Buffer.from(await response.arrayBuffer())))
  }
  return tiles.get(key)
}

// 웹 메르카토르 픽셀 좌표(줌 15, 256px 타일)
const worldPixel = ([lng, lat]) => {
  const scale = 256 * 2 ** ZOOM
  const sin = Math.sin(lat * Math.PI / 180)
  return [(lng + 180) / 360 * scale, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale]
}
async function pixelHeight(px, py) {
  const t = await tile(Math.floor(px / 256), Math.floor(py / 256))
  const i = ((py % 256) * 256 + (px % 256)) * t.channels
  return t.pixels[i] * 256 + t.pixels[i + 1] + t.pixels[i + 2] / 256 - 32768
}
// MapLibre와 같이 픽셀 가운데를 기준으로 쌍선형 보간합니다.
async function heightAt(lngLat) {
  const [fx, fy] = worldPixel(lngLat).map((value) => value - 0.5)
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0
  const [a, b, c, d] = await Promise.all([pixelHeight(x0, y0), pixelHeight(x0 + 1, y0), pixelHeight(x0, y0 + 1), pixelHeight(x0 + 1, y0 + 1)])
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
}

const bounds = getStreetSceneBounds(PADDING)
const minX = Math.floor(bounds.minX / CELL) * CELL, minZ = Math.floor(bounds.minZ / CELL) * CELL
const cols = Math.ceil((bounds.maxX - minX) / CELL) + 1, rows = Math.ceil((bounds.maxZ - minZ) / CELL) + 1
const heights = new Uint16Array(cols * rows)
let low = Infinity, high = -Infinity
for (let row = 0; row < rows; row++) {
  for (let col = 0; col < cols; col++) {
    const h = Math.max(0, await heightAt(toLngLat(minX + col * CELL, minZ + row * CELL)))
    low = Math.min(low, h); high = Math.max(high, h)
    heights[row * cols + col] = Math.round(h * 10) // 10cm 단위
  }
}
writeFileSync('src/generated/terrain.json', JSON.stringify({
  source: 'Terrain Tiles (Mapzen/Tilezen on AWS Open Data, terrarium z15): SRTM & GMTED2010 courtesy of the U.S. Geological Survey, ETOPO1 NOAA',
  zoom: ZOOM, cell: CELL, minX, minZ, cols, rows,
  heights: Buffer.from(heights.buffer).toString('base64'),
}))
console.log(`terrain.json: ${cols}x${rows} (${CELL}m), ${tiles.size} tiles, height ${low.toFixed(1)}~${high.toFixed(1)}m`)

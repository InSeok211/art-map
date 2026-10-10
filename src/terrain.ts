// 거리 장면의 지형 높이(해발 m)입니다. scripts/build-terrain.mjs가 만든 8m 격자(src/generated/terrain.json)를
// 쌍선형 보간해 장면 미터 좌표(동, 남)의 높이를 돌려줍니다. 공개 지도에서 '3D 지형'을 켤 때만 불러옵니다.
//
// 고도: Terrain Tiles(Mapzen/Tilezen, AWS Open Data) — SRTM·GMTED2010(미국 지질조사국), ETOPO1(NOAA).
// 바탕 지도의 MapLibre 지형도 같은 타일(TERRAIN_TILE_URL)을 써서 두 높이가 맞습니다.

import { outlineCenter } from './planGeometry'

export const TERRAIN_TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
export const TERRAIN_ATTRIBUTION = '지형: <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Terrain Tiles</a> (USGS SRTM·GMTED2010, NOAA ETOPO1)'

export interface TerrainData {
  cell: number
  minX: number
  minZ: number
  cols: number
  rows: number
  heights: string // 10cm 단위 Uint16(리틀 엔디언)을 base64로
}

function decodeBase64(text: string): Uint8Array {
  if (typeof atob === 'function') return Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
  return new Uint8Array((globalThis as unknown as { Buffer: { from: (value: string, encoding: string) => Uint8Array } }).Buffer.from(text, 'base64'))
}

export class TerrainSampler {
  private readonly heights: Float32Array
  constructor(private readonly data: TerrainData) {
    const bytes = decodeBase64(data.heights)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    this.heights = new Float32Array(data.cols * data.rows)
    for (let index = 0; index < this.heights.length; index++) this.heights[index] = view.getUint16(index * 2, true) / 10
  }

  // 장면 미터 (x, z)의 높이. 격자 밖은 가장자리 값을 씁니다.
  height(x: number, z: number) {
    const { cell, minX, minZ, cols, rows } = this.data
    const fx = Math.min(Math.max((x - minX) / cell, 0), cols - 1.001)
    const fz = Math.min(Math.max((z - minZ) / cell, 0), rows - 1.001)
    const col = Math.floor(fx), row = Math.floor(fz), tx = fx - col, tz = fz - row
    const at = (c: number, r: number) => this.heights[r * cols + c]
    return (at(col, row) * (1 - tx) + at(col + 1, row) * tx) * (1 - tz) + (at(col, row + 1) * (1 - tx) + at(col + 1, row + 1) * tx) * tz
  }

  // 건물 바닥이 비탈 위쪽 땅에 묻히지 않도록 윤곽의 꼭짓점·각 변의 가운데·한가운데 중 가장 높은 땅 높이를
  // 찾습니다(낮은 쪽은 StreetSceneLayer가 기초 벽으로 땅까지 잇습니다).
  highest(outline: [number, number][]) {
    if (!outline.length) return 0
    const edgeMiddles = outline.map(([x, z], index): [number, number] => {
      const [nextX, nextZ] = outline[(index + 1) % outline.length]
      return [(x + nextX) / 2, (z + nextZ) / 2]
    })
    return Math.max(...[...outline, ...edgeMiddles, outlineCenter(outline)].map(([x, z]) => this.height(x, z)))
  }
}

let loading: Promise<TerrainSampler> | null = null
// 지형 표(약 150KB)는 처음 '3D 지형'을 켤 때 따로 불러옵니다.
export function loadTerrain() {
  loading ??= import('./generated/terrain.json').then((module) => new TerrainSampler((module.default ?? module) as unknown as TerrainData))
  return loading
}

// 감천2동 표시 영역의 OpenStreetMap 건물 외곽선을 받아 src/gamcheon-buildings.json에 저장합니다.
// 벡터 타일의 건물은 z13~14에만 있어 줌에 따라 사라지므로, 영역 안 건물을 고정 사본으로 둡니다.
// 사용법: node scripts/fetch-buildings.mjs
import { readFile, writeFile } from 'node:fs/promises'

const boundary = JSON.parse(await readFile(new URL('../src/gamcheon2-boundary.json', import.meta.url), 'utf8'))
const ring = boundary.geometry.coordinates[0]
const longitudes = ring.map(([longitude]) => longitude)
const latitudes = ring.map(([, latitude]) => latitude)
// src/gamcheonBoundary.ts의 GAMCHEON_MAP_BOUNDS와 같은 여백입니다.
const west = Math.min(...longitudes) - 0.003
const south = Math.min(...latitudes) - 0.0025
const east = Math.max(...longitudes) + 0.003
const north = Math.max(...latitudes) + 0.0025

const query = `[out:json][timeout:60];way["building"](${south},${west},${north},${east});out geom tags;`
const response = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': 'gamcheon-map/0.1 (building snapshot script)' },
  body: new URLSearchParams({ data: query }),
})
if (!response.ok) throw new Error(`Overpass 요청 실패: ${response.status}`)
const { elements } = await response.json()

const round = (value) => Math.round(value * 1e6) / 1e6
const features = elements
  .filter((element) => element.type === 'way' && element.geometry?.length >= 4)
  .map((element) => {
    const coordinates = element.geometry.map(({ lon, lat }) => [round(lon), round(lat)])
    const [first] = coordinates
    const last = coordinates[coordinates.length - 1]
    if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push(first)
    const properties = { id: element.id }
    if (element.tags?.name) properties.name = element.tags.name
    if (element.tags?.['addr:housenumber']) properties.housenumber = element.tags['addr:housenumber']
    // Keep surveyed massing tags. The renderer prefers these over its generic
    // two-storey / roof-shape fallbacks when the mapper supplied them.
    if (element.tags?.height) properties.height = element.tags.height
    if (element.tags?.['building:levels']) properties.levels = element.tags['building:levels']
    if (element.tags?.['roof:shape']) properties.roofShape = element.tags['roof:shape']
    return { type: 'Feature', properties, geometry: { type: 'Polygon', coordinates: [coordinates] } }
  })

const collection = {
  type: 'FeatureCollection',
  source: 'OpenStreetMap contributors (ODbL), via Overpass API',
  fetchedAt: new Date().toISOString().slice(0, 10),
  features,
}
await writeFile(new URL('../src/gamcheon-buildings.json', import.meta.url), JSON.stringify(collection))
console.log(`건물 ${features.length}개 저장`)

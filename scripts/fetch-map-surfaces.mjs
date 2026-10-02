import { readFile, writeFile } from 'node:fs/promises'

const boundary = JSON.parse(await readFile(new URL('../src/gamcheon2-boundary.json', import.meta.url), 'utf8'))
const ring = boundary.geometry.coordinates[0]
const west = Math.min(...ring.map(([x]) => x)) - 0.003
const east = Math.max(...ring.map(([x]) => x)) + 0.003
const south = Math.min(...ring.map(([, y]) => y)) - 0.0025
const north = Math.max(...ring.map(([, y]) => y)) + 0.0025
const query = `[out:json][timeout:90];(way["highway"](${south},${west},${north},${east});way["landuse"~"forest|grass|meadow|recreation_ground"](${south},${west},${north},${east});way["natural"~"wood|grassland"](${south},${west},${north},${east});way["leisure"="park"](${south},${west},${north},${east}););out geom tags;`
const response = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': 'gamcheon-map/0.1 (map surface snapshot)' },
  body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(120_000),
})
if (!response.ok) throw new Error(`Surface fetch failed: ${response.status}`)
const { elements } = await response.json()
const roads = [], green = []
for (const way of elements) {
  if (!way.geometry || way.geometry.length < 2) continue
  const points = way.geometry.map(({ lon, lat }) => [lon, lat])
  const tags = way.tags ?? {}
  if (tags.highway) roads.push({ id: way.id, type: tags.highway, points,
    ...(tags.width && Number.isFinite(Number.parseFloat(tags.width)) ? { width: Number.parseFloat(tags.width) } : {}) })
  else if (points.length >= 4 && points[0].join() === points.at(-1).join()) green.push({ id: way.id, points })
}
await writeFile(new URL('../src/street-surfaces.json', import.meta.url), JSON.stringify({
  source: 'OpenStreetMap contributors (ODbL), via Overpass API', fetchedAt: new Date().toISOString(),
  bounds: [[west, south], [east, north]], roads, green,
}))
console.log(`Full map: ${roads.length} roads, ${green.length} green areas`)

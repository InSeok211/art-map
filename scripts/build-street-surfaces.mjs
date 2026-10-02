import { readFileSync, writeFileSync } from 'node:fs'

// The checked-in OSM extract is a reference snapshot. This script turns its
// ways into small, reviewable geometry data; no live map request is needed.
const xml = readFileSync(new URL('../design/street-osm-expanded.xml', import.meta.url), 'utf8')
const nodes = new Map([...xml.matchAll(/<node\b([^>]+?)\s*\/>/g)].map((match) => {
  const attributes = Object.fromEntries([...match[1].matchAll(/([\w:]+)="([^"]*)"/g)].map((part) => [part[1], part[2]]))
  return [attributes.id, [Number(attributes.lon), Number(attributes.lat)]]
}))
const roads = []
const green = []
for (const match of xml.matchAll(/<way\b([^>]+)>([\s\S]*?)<\/way>/g)) {
  const [, opening, body] = match
  const id = opening.match(/(?:^|\s)id="(\d+)"/)?.[1]
  if (!id) continue
  const points = [...body.matchAll(/<nd ref="(\d+)"\s*\/>/g)].map((part) => nodes.get(part[1])).filter(Boolean)
  const tags = Object.fromEntries([...body.matchAll(/<tag k="([^"]+)" v="([^"]*)"\s*\/>/g)].map((part) => [part[1], part[2]]))
  if (tags.highway && points.length >= 2) roads.push({ id: Number(id), type: tags.highway, points })
  if ((tags.landuse === 'forest' || tags.natural === 'wood') && points.length >= 4 && points[0].join() === points.at(-1).join()) {
    green.push({ id: Number(id), points })
  }
}
writeFileSync(new URL('../src/street-surfaces.json', import.meta.url), `${JSON.stringify({ roads, green }, null, 2)}\n`)
console.log(`Wrote ${roads.length} roads and ${green.length} green polygons`)

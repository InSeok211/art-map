// 홈페이지에 저장된(관리자가 확인한) 골목길을 받아 src/recorded-alleys.json에 저장합니다.
// 사용법: npm run pull:alleys -- https://gamcheon-artist-map-apply.rjbcom4263.workers.dev
// 그다음 `npm run build:road-ground`로 도로 바닥을 다시 만들면 이 골목길이 바닥에 구워지고 걸친 건물이 깎입니다.
import { readFileSync, writeFileSync } from 'node:fs'

const site = (process.argv[2] || 'https://gamcheon-artist-map-apply.rjbcom4263.workers.dev').replace(/\/$/, '')
const response = await fetch(`${site}/api/map-alleys`, { headers: { accept: 'application/json' } })
if (!response.ok) {
  console.error(`골목길을 받지 못했습니다: ${response.status} ${response.statusText}`)
  process.exit(1)
}
const { alleys } = await response.json()
if (!Array.isArray(alleys)) {
  console.error('홈페이지가 골목길 목록을 돌려주지 않았습니다.')
  process.exit(1)
}
// 좌표를 1cm 단위로 맞춰 저장합니다(같은 내용이면 파일이 바뀌지 않게).
const clean = alleys.map(({ id, name, coordinates, widthMeters }) => ({
  id, ...(name ? { name } : {}), widthMeters,
  coordinates: coordinates.map(([lng, lat]) => [Math.round(lng * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7]),
}))
const next = `${JSON.stringify(clean, null, 2)}\n`
const file = 'src/recorded-alleys.json'
const changed = readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== next
if (changed) writeFileSync(file, next)
console.log(`골목길 ${clean.length}개${changed ? ' 저장 — npm run build:road-ground를 다시 돌려 주세요.' : ', 바뀐 것 없음'}`)

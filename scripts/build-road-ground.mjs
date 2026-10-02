// 거리 장면의 도로·보도 면을 미리 계산해 src/generated/road-ground.json에 저장합니다.
// 사용법: npm run build:road-ground
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { build } from 'rolldown'
import { roadGroundInputsHash } from './road-ground-inputs.mjs'

const started = performance.now()
// 앱 소스(TypeScript, JSON 가져오기, CommonJS 패키지)를 Vite와 같은 번들러(rolldown)로 한 파일로 묶어 Node에서 실행합니다.
const outfile = 'node_modules/.cache/gamcheon-map/road-ground-entry.mjs'
await build({
  input: 'scripts/road-ground-entry.ts',
  platform: 'node',
  logLevel: 'warn',
  output: { file: outfile, format: 'esm' },
})
const { getPhotographedStreetBuildings, getStreetSceneBounds, computeRoadGround, roundRoadGround } =
  await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`)
const ground = roundRoadGround(computeRoadGround(getPhotographedStreetBuildings(), getStreetSceneBounds()))
writeFileSync('src/generated/road-ground.json', JSON.stringify({ inputsHash: roadGroundInputsHash(), ...ground }))
const vertices = Object.values(ground).flat(3).length
console.log(`road-ground.json: ${vertices} vertices, ${Math.round(performance.now() - started) / 1000}s`)

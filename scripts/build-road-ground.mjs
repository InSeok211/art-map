// 거리 장면의 미리 계산하는 데이터를 만듭니다. 사용법: npm run build:road-ground
//  1) src/generated/building-outlines.json: 건물마다 도로·골목길과 겹친 부분을 깎은 윤곽
//  2) src/generated/road-ground.json: 도로·보도 면(1의 윤곽으로 건물 자리를 뺌)
// 둘 다 지도를 열 때마다 하던 무거운 계산이라 미리 해 둡니다. 입력이 바뀌면 테스트가 다시 만들라고 알려 줍니다.
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { build } from 'rolldown'
import { buildingOutlinesInputsHash, roadGroundInputsHash } from './road-ground-inputs.mjs'

const started = performance.now()
// 앱 소스(TypeScript, JSON 가져오기, CommonJS 패키지)를 Vite와 같은 번들러(rolldown)로 한 파일로 묶어 Node에서 실행합니다.
// 1에서 쓴 저장본을 2가 읽도록, 단계마다 새로 묶습니다.
async function load() {
  const outfile = 'node_modules/.cache/gamcheon-map/road-ground-entry.mjs'
  await build({ input: 'scripts/road-ground-entry.ts', platform: 'node', logLevel: 'warn', output: { file: outfile, format: 'esm' } })
  return import(`${pathToFileURL(outfile).href}?t=${Date.now()}`)
}

const { computeBuildingOutlines } = await load()
const outlines = computeBuildingOutlines()
writeFileSync('src/generated/building-outlines.json', JSON.stringify({ inputsHash: buildingOutlinesInputsHash(), outlines }))
const trimmed = outlines.filter((outline) => outline !== 0).length
console.log(`building-outlines.json: ${outlines.length} buildings, ${trimmed} trimmed or removed`)

const { getPhotographedStreetBuildings, getStreetSceneBounds, computeRoadGround, roundRoadGround } = await load()
const ground = roundRoadGround(computeRoadGround(getPhotographedStreetBuildings(), getStreetSceneBounds()))
writeFileSync('src/generated/road-ground.json', JSON.stringify({ inputsHash: roadGroundInputsHash(), ...ground }))
const vertices = Object.values(ground).flat(3).length
console.log(`road-ground.json: ${vertices} vertices, ${Math.round(performance.now() - started) / 1000}s`)

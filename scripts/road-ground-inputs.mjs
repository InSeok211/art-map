import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

// 도로 바닥 저장본(src/generated/road-ground.json)에 영향을 주는 파일입니다. 이 중 하나라도 바뀌면
// `npm run build:road-ground`로 저장본을 다시 만들어야 하고, 테스트가 그것을 확인합니다.
export const ROAD_GROUND_INPUTS = [
  'src/gamcheon-buildings.json',
  'src/street-surfaces.json',
  'src/gamcheonBoundary.ts',
  'src/streetSceneData.ts',
  'src/streetSurfaceData.ts',
  'src/streetRoadGeometry.ts',
  'src/roadCorridors.ts',
  'src/roadGround.ts',
  'src/recorded-alleys.json',
  'src/recordedAlleys.ts',
  'src/alleys.ts',
]

export function roadGroundInputsHash(root = '.') {
  const hash = createHash('sha256')
  for (const file of ROAD_GROUND_INPUTS) {
    // 줄바꿈 방식(CRLF/LF)이 달라도 같은 내용이면 같은 값이 나오게 합니다.
    hash.update(file).update('\0').update(readFileSync(`${root}/${file}`, 'utf8').replace(/\r\n/g, '\n')).update('\0')
  }
  return hash.digest('hex').slice(0, 16)
}

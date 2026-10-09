// 배포물에 들어가는 오픈소스 패키지의 라이선스 전문과 지도 데이터 출처를 한 텍스트 파일로 모읍니다.
// MIT·BSD·ISC·Apache 라이선스는 재배포할 때 저작권 표시와 라이선스 전문을 함께 두도록 요구합니다.
// 사용법(직접 실행): node scripts/third-party-notices.mjs <출력 파일> [다른 package-lock.json이 있는 폴더 ...]
import { existsSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 빌드할 때만 쓰거나 Cloudflare Worker·브라우저 번들에 들어가지 않는 패키지(이미지 변환용 네이티브 바이너리)
const NOT_SHIPPED = /^(sharp|@img\/)/

export const DATA_NOTICE = `지도 데이터와 3D 에셋 출처
========================================

- 지도 데이터: © OpenStreetMap contributors. Open Database License(ODbL) 1.0으로 제공됩니다.
  https://www.openstreetmap.org/copyright
  건물 윤곽, 도로·녹지, 감천2동 경계와 이를 가공한 3D 바닥 데이터(gamcheon-buildings.json, street-surfaces.json,
  road-ground.json, map-data/*.json)는 OpenStreetMap에서 파생한 데이터베이스이며 같은 ODbL 1.0 조건으로 제공합니다.
- 배경 지도 타일: OpenFreeMap(https://openfreemap.org/), 지도 스타일과 스키마 © OpenMapTiles(https://openmaptiles.org/).
- 지도 스타일: Positron © CARTO, © OpenMapTiles (코드 BSD-3-Clause, 디자인 CC BY 4.0)을 고쳐 사용합니다.
- 지형 고도('3D 지형'): Terrain Tiles (Mapzen/Tilezen, https://registry.opendata.aws/terrain-tiles/).
  SRTM·GMTED2010 data courtesy of the U.S. Geological Survey, ETOPO1 — NOAA National Centers for Environmental Information.
  이 타일에서 뽑은 높이 표(terrain.json)를 함께 씁니다.
- 3D 건물 모델, 공방·그린하우스·아름다운한글 시안 GLB, 외벽 질감은 모두 직접 만든 절차적(코드로 생성한) 모델입니다. 외부 제작 3D 에셋은 쓰지 않으며,
  벽화·그림·서예 작품·로고 자리는 사진을 넣지 않고 단색 면으로만 표시합니다.
`

async function licenseText(directory) {
  const files = (await readdir(directory)).filter((name) => /^(licen[cs]e|copying|notice)(\.|$|-)/i.test(name)).sort()
  const texts = []
  for (const file of files) texts.push((await readFile(path.join(directory, file), 'utf8')).trim())
  return texts.join('\n\n')
}

// package-lock.json의 실행용(개발용이 아닌) 패키지를 모읍니다.
async function shippedPackages(root) {
  const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'))
  const result = []
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    if (!key || entry.dev || entry.devOptional) continue
    const name = key.replace(/^.*node_modules\//, '')
    if (NOT_SHIPPED.test(name)) continue
    const directory = path.join(root, key)
    if (!existsSync(path.join(directory, 'package.json'))) continue
    const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'))
    const license = typeof manifest.license === 'object' ? manifest.license.type : manifest.license
    result.push({ name, version: manifest.version, license: license ?? 'UNKNOWN', directory })
  }
  return result
}

export async function writeThirdPartyNotices(output, roots) {
  const seen = new Map()
  for (const root of roots) for (const item of await shippedPackages(root)) seen.set(`${item.name}@${item.version}`, item)
  const packages = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
  const sections = []
  for (const item of packages) {
    const text = await licenseText(item.directory)
    sections.push(`${item.name} ${item.version} (${item.license})\n${'-'.repeat(60)}\n${text || `라이선스: ${item.license} (패키지에 별도 라이선스 파일이 없습니다)`}`)
  }
  const body = `감천 작가 지도 — 제3자 고지(Third-party notices)\n\n${DATA_NOTICE}\n\n오픈소스 소프트웨어\n========================================\n\n${sections.join('\n\n\n')}\n`
  await writeFile(output, body)
  return packages
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [output, ...others] = process.argv.slice(2)
  if (!output) {
    console.error('출력 파일 경로를 넘겨 주세요.')
    process.exit(1)
  }
  const packages = await writeThirdPartyNotices(output, [process.cwd(), ...others])
  console.log(`${packages.length}개 패키지의 라이선스를 ${output}에 썼습니다.`)
}

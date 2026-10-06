// 감천 골목지도를 감천 작가 지도 홈페이지(Next.js/vinext) 저장소의 public 폴더로 내보냅니다.
// 사용법: npm run export:site -- <홈페이지 저장소 경로>
//
//  - public/artist-map-embed/ : 공개 작가 지도(/map)가 iframe으로 쓰는 지도(embed.html, src/embed.tsx)
//  - public/admin-art-map/assets/ : 관리자 골목지도 작업실(/admin/art-map)이 쓰는 편집용 지도(index.html, src/demo.tsx)
//    관리자 페이지가 고정된 이름(map.js, map.css)으로 불러오므로 진입 파일 이름을 바꿔 둡니다.
//  - public/third-party-notices.txt : 지도와 홈페이지가 쓰는 오픈소스 라이선스 전문·지도 데이터 출처
//  - app/admin/art-map/page.tsx 의 "Bundled from ... at <커밋>" 표시를 현재 커밋으로 갱신합니다.
import { execSync } from 'node:child_process'
import { cp, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { build } from 'vite'
import { writeThirdPartyNotices } from './third-party-notices.mjs'

const site = process.argv[2]
if (!site || !existsSync(path.join(site, 'app/admin/art-map/page.tsx'))) {
  console.error('홈페이지 저장소 경로를 넘겨 주세요. 예: npm run export:site -- "C:/Users/me/Desktop/site"')
  process.exit(1)
}

const work = '.site-build'
await rm(work, { recursive: true, force: true })

async function buildApp(name, base, input) {
  const outDir = path.join(work, name)
  await build({
    // The export supplies its own inputs/base; the Vite dev-server config is
    // unnecessary here and can fail to resolve under the Windows sandbox.
    configFile: false,
    base,
    logLevel: 'warn',
    build: { outDir, emptyOutDir: true, rolldownOptions: { input } },
  })
  return outDir
}

async function copyAssetFolders(destination, kinds) {
  // 3D 배치용 모델은 실행 중에 JS 파일 옆 assets/ 아래에서 불러옵니다(modelCatalog.ts).
  for (const kind of kinds) {
    await mkdir(path.join(destination, 'assets', kind), { recursive: true })
    await cp(path.join('src/assets', kind), path.join(destination, 'assets', kind), { recursive: true, force: true })
  }
}

// 1) 공개 지도 iframe
const embedOut = await buildApp('embed', '/artist-map-embed/', 'embed.html')
const embedTarget = path.join(site, 'public/artist-map-embed')
await rm(embedTarget, { recursive: true, force: true })
await cp(embedOut, embedTarget, { recursive: true })
// 공개 지도는 사용자 GLB를 쓰지 않으므로 따로 넣을 에셋이 없습니다.

// 2) 관리자 편집용 지도
const adminOut = await buildApp('admin', '/admin-art-map/', 'index.html')
const adminTarget = path.join(site, 'public/admin-art-map/assets')
await rm(adminTarget, { recursive: true, force: true })
await cp(path.join(adminOut, 'assets'), adminTarget, { recursive: true })
for (const file of await readdir(adminTarget)) {
  if (/^index-.*\.js$/.test(file)) await rename(path.join(adminTarget, file), path.join(adminTarget, 'map.js'))
  if (/^index-.*\.css$/.test(file)) await rename(path.join(adminTarget, file), path.join(adminTarget, 'map.css'))
}
if (!existsSync(path.join(adminTarget, 'map.js')) || !existsSync(path.join(adminTarget, 'map.css'))) {
  throw new Error('관리자 지도의 진입 파일(index-*.js/css)을 찾지 못했습니다.')
}
await copyAssetFolders(adminTarget, ['models'])

// 3) 오픈소스 라이선스 전문과 지도 데이터 출처(사이트 바닥글의 링크가 가리킴)
await writeThirdPartyNotices(path.join(site, 'public/third-party-notices.txt'), [process.cwd(), site])

// 4) 관리자 페이지의 출처 커밋 표시
const commit = execSync('git rev-parse --short HEAD').toString().trim()
const dirty = execSync('git status --porcelain').toString().trim() ? ' + uncommitted changes' : ''
const pagePath = path.join(site, 'app/admin/art-map/page.tsx')
const page = await readFile(pagePath, 'utf8')
await writeFile(pagePath, page.replace(/\/\/ Bundled from https:\/\/github\.com\/InSeok211\/art-map at [^\n]*/,
  `// Bundled from https://github.com/InSeok211/art-map at ${commit}${dirty}.`))

await rm(work, { recursive: true, force: true })
console.log(`내보내기 완료: ${commit}${dirty}`)
console.log(`- ${embedTarget}`)
console.log(`- ${adminTarget}`)

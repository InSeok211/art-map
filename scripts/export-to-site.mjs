// 감천 골목지도를 감천 작가 지도 홈페이지(한 서버) 저장소로 내보냅니다. 홈페이지를 배포하면 지도도 함께 나갑니다.
// 사용법: npm run export:site -- <홈페이지 저장소 경로>
//
//  - public/map-app/          : 공개 지도(/map-app/, 홈페이지 /map이 iframe으로 씀)와 편집 앱(/map-app/studio/,
//                               운영자 화면 /admin/map-editor가 iframe으로 씀)
//  - app/map/generated/map-api.js : 지도 API(server/). 홈페이지의 /api/map-*·/api/admin/map-*·/api/admin/gps-trails
//                               주소가 handleApi로 넘깁니다(검사 규칙이 지도 화면과 한 곳에서 관리됨).
//  - public/third-party-notices.txt : 지도와 홈페이지가 쓰는 오픈소스 라이선스 전문·지도 데이터 출처
import { execSync } from 'node:child_process'
import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { build } from 'vite'
import { build as bundle } from 'esbuild'
import { writeThirdPartyNotices } from './third-party-notices.mjs'

const site = process.argv[2]
if (!site || !existsSync(path.join(site, 'app/admin/map-editor/page.tsx'))) {
  console.error('홈페이지 저장소 경로를 넘겨 주세요. 예: npm run export:site -- "C:/Users/me/Desktop/site"')
  process.exit(1)
}

const commit = execSync('git rev-parse --short HEAD').toString().trim()
const dirty = execSync('git status --porcelain').toString().trim() ? ' + uncommitted changes' : ''
const stamp = `https://github.com/InSeok211/art-map at ${commit}${dirty}`
const work = '.site-build'
await rm(work, { recursive: true, force: true })

// 1) 화면: 공개 지도와 편집 앱
await build({
  // vite.config.ts는 개발 서버용입니다. 내보낼 때는 홈페이지 주소(/map-app/)에 맞춰 따로 빌드합니다.
  configFile: false,
  base: '/map-app/',
  logLevel: 'warn',
  build: { outDir: work, emptyOutDir: true, rolldownOptions: { input: { map: 'index.html', studio: 'studio/index.html' } } },
})
const appTarget = path.join(site, 'public/map-app')
await rm(appTarget, { recursive: true, force: true })
await cp(work, appTarget, { recursive: true })

// 2) 지도 API
const apiTarget = path.join(site, 'app/map/generated')
await mkdir(apiTarget, { recursive: true })
for (const [route, source] of [
  ['app/api/map-bus-arrivals', '../../map/map-api'],
  ['app/api/map-places', '../../map/map-api'],
  ['app/api/admin/map-places', '../../../map/map-api'],
]) {
  await mkdir(path.join(site, route), { recursive: true })
  await writeFile(path.join(site, route, 'route.ts'), `// 지도 장소 API: art-map 내보내기로 생성합니다.\nexport { GET, POST, PUT, DELETE } from '${source}';\n`)
}
await bundle({
  entryPoints: ['server/index.ts'],
  outfile: path.join(apiTarget, 'map-api.js'),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  legalComments: 'inline',
  banner: { js: `// 자동 생성 파일입니다. 고치지 말고 art-map 저장소의 server/를 고친 뒤 npm run export:site로 다시 만드세요.\n// Bundled from ${stamp}.` },
  logLevel: 'warning',
})
await writeFile(path.join(apiTarget, 'map-api.d.ts'), `// 자동 생성 파일입니다(art-map 저장소의 server/env.ts, server/index.ts). Bundled from ${stamp}.
export interface MapEnv {
  busanBusApiKey?: string
  /** 홈페이지 D1 */
  DB: object
  /** 홈페이지 R2(3D 모델은 map-models/ 아래) */
  MODELS: object
  /** 이 요청이 홈페이지 운영자로 로그인한 사람의 것인지 */
  isAdmin: (request: Request) => Promise<boolean>
}
export declare function handleApi(request: Request, env: MapEnv, url?: URL): Promise<Response>
`)

// 3) 오픈소스 라이선스 전문과 지도 데이터 출처(사이트 바닥글의 링크가 가리킴)
await writeThirdPartyNotices(path.join(site, 'public/third-party-notices.txt'), [process.cwd(), site])

await rm(work, { recursive: true, force: true })
console.log(`내보내기 완료: ${stamp}`)
console.log(`- ${appTarget}`)
console.log(`- ${path.join(apiTarget, 'map-api.js')}`)

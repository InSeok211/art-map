// 홈페이지 운영자 화면이 편집 앱 허가증을 발급할 수 있게, 두 서버에 같은 비밀값(MAP_EDIT_SECRET)을 넣습니다.
// 비밀값은 여기서 무작위로 만들어 wrangler secret put에 바로 넘기고 화면이나 파일에 남기지 않습니다.
// 다시 실행하면 새 값으로 바뀌고, 이미 열어 둔 편집 화면은 홈페이지에서 다시 열어야 합니다.
//
// 사용법(홈페이지 폴더는 wrangler.jsonc가 있는 곳)
//   npm run link:homepage -- <홈페이지 폴더>
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const homepage = process.argv[2]
if (!homepage || !existsSync(join(homepage, 'wrangler.jsonc'))) {
  console.error('홈페이지 폴더(wrangler.jsonc가 있는 곳)를 알려 주세요: npm run link:homepage -- <홈페이지 폴더>')
  process.exit(1)
}
const secret = randomBytes(32).toString('base64url')

function put(cwd, label) {
  const wrangler = join(cwd, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
  const result = spawnSync(process.execPath, [wrangler, 'secret', 'put', 'MAP_EDIT_SECRET'], { cwd, input: secret, stdio: ['pipe', 'inherit', 'inherit'] })
  if (result.status !== 0) { console.error(`${label}에 넣지 못했습니다.`); process.exit(1) }
  console.log(`${label}에 MAP_EDIT_SECRET을 넣었습니다.`)
}

put(resolve('.'), '지도 앱 서버')
put(resolve(homepage), '홈페이지 서버')

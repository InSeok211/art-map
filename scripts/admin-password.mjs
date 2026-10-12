// 편집 앱(/studio/) 관리자 아이디·비밀번호를 설정합니다. 비밀번호는 화면에 보이지 않게 직접 입력하고,
// 서버에는 비밀번호 대신 PBKDF2 해시만 비밀값(ADMIN_PASSWORD_HASH)으로 넣습니다(server/password.ts와 같은 방식).
// 로그인 쿠키에 서명할 SESSION_SECRET도 새로 만듭니다(바꾸면 로그인해 있던 곳은 모두 로그아웃됨).
//
// 사용법
//   npm run admin:password            배포한 지도 앱 서버에 넣기(wrangler secret put)
//   npm run admin:password -- --local 내 PC 확인용(.dev.vars 파일, git에 올라가지 않음)
import { spawnSync } from 'node:child_process'
import { webcrypto } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { stdin, stdout } from 'node:process'

const ITERATIONS = 100_000

async function hashPassword(password) {
  const salt = webcrypto.getRandomValues(new Uint8Array(16))
  const key = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = new Uint8Array(await webcrypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256))
  return `pbkdf2-sha256$${ITERATIONS}$${Buffer.from(salt).toString('base64')}$${Buffer.from(bits).toString('base64')}`
}

// 한 줄을 읽습니다. hidden이면 입력한 글자를 화면에 보이지 않습니다. 한 번에 여러 줄이 들어오면(붙여넣기·파이프)
// 남은 줄은 다음 질문에 씁니다.
let pending = ''
function ask(question, hidden = false) {
  return new Promise((resolve) => {
    stdout.write(question)
    let value = ''
    if (stdin.isTTY) stdin.setRawMode(true)
    stdin.setEncoding('utf8')
    const finish = () => {
      stdin.off('data', onData)
      stdin.off('end', onEnd)
      if (stdin.isTTY) stdin.setRawMode(false)
      stdin.pause()
      stdout.write('\n')
      resolve(value)
    }
    const take = () => {
      while (pending) {
        const char = pending[0]
        pending = pending.slice(1)
        if (char === '\u0003') { stdout.write('\n'); process.exit(1) }
        if (char === '\r' || char === '\n') {
          if (char === '\r' && pending[0] === '\n') pending = pending.slice(1)
          finish()
          return
        }
        if (char === '\u007f' || char === '\b') {
          if (value) { value = value.slice(0, -1); if (!hidden) stdout.write('\b \b') }
          continue
        }
        value += char
        if (!hidden) stdout.write(char)
      }
    }
    const onData = (chunk) => { pending += chunk; take() }
    const onEnd = () => { pending += '\n'; take() }
    stdin.on('data', onData)
    stdin.on('end', onEnd)
    stdin.resume()
    take()
  })
}

const local = process.argv.includes('--local')
const username = (await ask('관리자 아이디: ')).trim()
if (!username) throw new Error('아이디를 입력해 주세요.')
const password = await ask('비밀번호(12자 이상, 화면에 보이지 않음): ', true)
if (password.length < 12) throw new Error('비밀번호는 12자 이상으로 정해 주세요.')
if (await ask('비밀번호 한 번 더: ', true) !== password) throw new Error('두 비밀번호가 다릅니다.')

const secrets = {
  ADMIN_USERNAME: username,
  ADMIN_PASSWORD_HASH: await hashPassword(password),
  SESSION_SECRET: Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('hex'),
}

if (local) {
  writeFileSync('.dev.vars', Object.entries(secrets).map(([name, value]) => `${name}="${value}"`).join('\n') + '\n')
  console.log('.dev.vars에 저장했습니다(내 PC 확인용, git에 올라가지 않음).')
} else {
  for (const [name, value] of Object.entries(secrets)) {
    const result = spawnSync('npx', ['wrangler', 'secret', 'put', name], { input: value, stdio: ['pipe', 'inherit', 'inherit'], shell: true })
    if (result.status !== 0) throw new Error(`${name}을(를) 넣지 못했습니다.`)
  }
  console.log('지도 앱 서버에 관리자 로그인을 설정했습니다.')
}

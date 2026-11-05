import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { writeThirdPartyNotices } from './third-party-notices.mjs'

const folders: string[] = []
afterEach(async () => {
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true })
})

async function site(fonts: Record<string, string> = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'notices-'))
  folders.push(root)
  await writeFile(path.join(root, 'package-lock.json'), JSON.stringify({ packages: {} }))
  if (Object.keys(fonts).length) {
    await mkdir(path.join(root, 'public/fonts'), { recursive: true })
    for (const [name, text] of Object.entries(fonts)) await writeFile(path.join(root, 'public/fonts', name), text)
  }
  return root
}

async function notices(...roots: string[]) {
  const output = path.join(roots[0], 'out.txt')
  await writeThirdPartyNotices(output, roots)
  return readFile(output, 'utf8')
}

describe('제3자 고지', () => {
  it('배포하는 폰트의 라이선스 전문을 함께 싣는다', async () => {
    const text = await notices(await site({ 'OFL-NotoSansKR.txt': 'Copyright Adobe.\nSIL OPEN FONT LICENSE' }))
    expect(text).toContain('NotoSansKR')
    expect(text).toContain('SIL OPEN FONT LICENSE')
    expect(text).toContain('Copyright Adobe.')
  })

  it('여러 저장소의 폰트를 모두 싣고, 라이선스 파일이 아닌 파일은 싣지 않는다', async () => {
    const first = await site({ 'OFL-One.txt': 'license one', 'One.ttf': 'BINARY-FONT-DATA' })
    const second = await site({ 'OFL-Two.txt': 'license two' })
    const text = await notices(first, second)
    expect(text).toContain('license one')
    expect(text).toContain('license two')
    expect(text).not.toContain('BINARY-FONT-DATA')
  })

  it('폰트가 없어도 고지를 만든다', async () => {
    const text = await notices(await site())
    expect(text).toContain('제3자 고지')
    expect(text).not.toContain('폰트\n=')
  })
})

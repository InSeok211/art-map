import { cp, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

for (const kind of ['models']) {
  const source = fileURLToPath(new URL(`../src/assets/${kind}/`, import.meta.url))
  // 라이브러리 빌드(dist)가 실행 중에 dist/assets/ 아래에서 모델을 불러옵니다.
  const relative = `../dist/assets/${kind}/`
  const destination = fileURLToPath(new URL(relative, import.meta.url))
  await mkdir(destination, { recursive: true })
  await cp(source, destination, { recursive: true, force: true })
}

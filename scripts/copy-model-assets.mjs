import { cp, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

for (const kind of ['models']) {
  const source = fileURLToPath(new URL(`../src/assets/${kind}/`, import.meta.url))
  // The library entry sits in dist; the demo entry sits in dist/assets.
  const relative = process.argv.includes('--demo') ? `../dist/assets/assets/${kind}/` : `../dist/assets/${kind}/`
  const destination = fileURLToPath(new URL(relative, import.meta.url))
  await mkdir(destination, { recursive: true })
  await cp(source, destination, { recursive: true, force: true })
}

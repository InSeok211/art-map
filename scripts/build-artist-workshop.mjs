import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'

// A lightweight map miniature refined against Kakao Roadview (2025-11), not a surveyed model.
class NodeFileReader {
  result = null
  onloadend = null
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => { this.result = buffer; this.onloadend?.() })
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => { this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`; this.onloadend?.() })
  }
}
globalThis.FileReader ??= NodeFileReader

const scene = new THREE.Scene()
scene.name = 'artist-workshop-180'
const makeMaterial = (name, color, options = {}) => new THREE.MeshStandardMaterial({ name, color, roughness: 0.82, metalness: 0, ...options })
const wall = makeMaterial('warm-grey-brick-mortar', 0xa79a89)
const interior = makeMaterial('warm-ivory-interior', 0xe7d9bd)
const concrete = makeMaterial('terrace-concrete', 0xb9b4a7)
const charcoal = makeMaterial('dark-window-frame', 0x343b3b, { metalness: 0.28, roughness: 0.45 })
const paleMetal = makeMaterial('pale-roof-rail', 0xc3c7be, { metalness: 0.42, roughness: 0.42 })
const glass = makeMaterial('clear-blue-glass', 0x9fc2c6, { metalness: 0.08, roughness: 0.12, transparent: true, opacity: 0.31, side: THREE.DoubleSide, depthWrite: false })
const roofMetal = makeMaterial('slate-roof', 0x626e75, { metalness: 0.25, roughness: 0.56 })
const wood = makeMaterial('atelier-wood', 0x9b6c45)
const paper = makeMaterial('art-paper', 0xf2e4cb)
const warmLight = makeMaterial('warm-window-light', 0xffd69a, { emissive: 0xefaa56, emissiveIntensity: 0.3 })
const brickPalette = [0xb4a08a, 0x8b7869, 0xc8b7a0, 0x74685e, 0xd4c4ad, 0xa58e7d].map((color, i) => makeMaterial(`brick-tone-${i + 1}`, color))

function group(name, parent = scene) {
  const result = new THREE.Group()
  result.name = name
  parent.add(result)
  return result
}

function block(parent, name, material, size, position, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
  mesh.name = name
  mesh.position.set(...position)
  mesh.rotation.set(...rotation)
  parent.add(mesh)
  return mesh
}

const shell = group('brick-shell')
// Coordinates: x = long glazed street front, z+ = glazed side of the corner.
block(shell, 'foundation', concrete, [10.2, 0.22, 6.2], [0, 0.11, 0])
block(shell, 'front-lower-brick', wall, [10, 1.02, 0.22], [0, 0.73, 3])
block(shell, 'front-upper-brick', wall, [10, 0.8, 0.22], [0, 3.55, 3])
block(shell, 'front-left-pier', wall, [0.55, 2.1, 0.22], [-4.73, 2.29, 3])
block(shell, 'rear-wall', wall, [10, 3.85, 0.22], [0, 2.03, -3])
block(shell, 'left-wall', wall, [0.22, 3.85, 6], [-5, 2.03, 0])
block(shell, 'right-lower-brick', wall, [0.22, 1.02, 6], [5, 0.73, 0])
block(shell, 'right-upper-brick', wall, [0.22, 0.8, 6], [5, 3.55, 0])
block(shell, 'right-rear-brick', wall, [0.22, 2.1, 4.12], [5, 2.29, -0.94])
block(shell, 'roof-terrace-floor', concrete, [10, 0.18, 6], [0, 3.79, 0])
block(shell, 'front-parapet', wall, [10, 0.42, 0.26], [0, 4.15, 3])
block(shell, 'right-parapet', wall, [0.26, 0.42, 6], [5, 4.15, 0])
block(shell, 'rear-parapet', wall, [10, 0.42, 0.26], [0, 4.15, -3])
block(shell, 'left-parapet', wall, [0.26, 0.42, 6], [-5, 4.15, 0])

// Repeating mixed brick faces are merged by color to keep GLB draw calls small.
const bricks = group('mixed-brick-cladding', shell)
const brickGeometries = brickPalette.map(() => [])
function brickFace(axis, face, horizontalStart, horizontalEnd, bottom, top) {
  const width = 0.51
  const height = 0.16
  const rows = Math.floor((top - bottom) / 0.205)
  for (let row = 0; row < rows; row++) {
    const offset = row % 2 ? width / 2 : 0
    for (let horizontal = horizontalStart + offset; horizontal + width <= horizontalEnd; horizontal += 0.57) {
      const materialIndex = Math.abs(Math.floor(horizontal * 17 + row * 11)) % brickPalette.length
      const geometry = new THREE.BoxGeometry(axis === 'z' ? width : 0.035, height, axis === 'z' ? 0.035 : width)
      if (axis === 'z') geometry.translate(horizontal + width / 2, bottom + row * 0.205 + height / 2 + 0.04, face)
      else geometry.translate(face, bottom + row * 0.205 + height / 2 + 0.04, horizontal + width / 2)
      brickGeometries[materialIndex].push(geometry)
    }
  }
}
brickFace('z', 3.13, -4.86, 4.86, 0.24, 1.19)
brickFace('z', 3.13, -4.86, 4.86, 3.22, 4.26)
brickFace('z', -3.13, -4.86, 4.86, 0.24, 4.26)
brickFace('x', -5.13, -2.9, 2.9, 0.24, 4.26)
brickFace('x', 5.13, -2.9, 2.9, 0.24, 1.19)
brickFace('x', 5.13, -2.9, 2.9, 3.22, 4.26)
brickFace('x', 5.13, -2.9, 0.86, 1.2, 3.21)
brickGeometries.forEach((geometries, index) => {
  const merged = mergeGeometries(geometries)
  const mesh = new THREE.Mesh(merged, brickPalette[index])
  mesh.name = `brick-color-${index + 1}`
  bricks.add(mesh)
  geometries.forEach((geometry) => geometry.dispose())
})

const glazing = group('corner-glazing')
block(glazing, 'front-clear-glass', glass, [9.3, 1.96, 0.04], [0.23, 2.24, 3.02])
for (const x of [-4.4, -1.35, 1.65, 4.86]) block(glazing, 'front-steel-mullion', charcoal, [0.07, 2.16, 0.1], [x, 2.24, 3.07])
block(glazing, 'front-window-sill', charcoal, [9.48, 0.09, 0.13], [0.18, 1.16, 3.08])
block(glazing, 'front-window-header', charcoal, [9.48, 0.1, 0.13], [0.18, 3.31, 3.08])
block(glazing, 'side-clear-glass', glass, [0.04, 1.96, 1.95], [5.02, 2.24, 2.01])
for (const z of [1.06, 2.95]) block(glazing, 'side-steel-mullion', charcoal, [0.1, 2.16, 0.07], [5.07, 2.24, z])
block(glazing, 'side-window-sill', charcoal, [0.13, 0.09, 2], [5.07, 1.16, 2])
block(glazing, 'side-window-header', charcoal, [0.13, 0.1, 2], [5.07, 3.31, 2])

const door = group('side-entrance')
const doorWhite = makeMaterial('white-double-door', 0xe5e7e2)
const doorFrost = makeMaterial('frosted-door-window', 0xa9bec1, { metalness: 0.03, roughness: 0.65 })
block(door, 'side-door-left-leaf', doorWhite, [0.06, 2.28, 0.53], [5.17, 1.38, -2.12])
block(door, 'side-door-right-leaf', doorWhite, [0.06, 2.28, 0.53], [5.17, 1.38, -1.56])
for (const z of [-2.12, -1.56]) block(door, 'frosted-door-pane', doorFrost, [0.07, 1.22, 0.37], [5.22, 1.78, z])
for (const z of [-2.43, -1.25]) block(door, 'door-frame-side', doorWhite, [0.08, 2.36, 0.07], [5.22, 1.38, z])
block(door, 'door-center-rail', doorWhite, [0.085, 2.35, 0.05], [5.24, 1.38, -1.84])
block(door, 'door-frame-top', doorWhite, [0.08, 0.07, 1.2], [5.22, 2.57, -1.84])
for (const z of [-1.9, -1.78]) block(door, 'door-handle', paleMetal, [0.09, 0.06, 0.04], [5.29, 1.31, z])
block(door, 'entry-step', concrete, [0.75, 0.15, 1.45], [5.34, 0.24, -1.84])

const atelier = group('atelier-interior')
block(atelier, 'interior-floor', wood, [9.6, 0.08, 5.5], [0, 0.27, 0])
block(atelier, 'interior-back-wall', interior, [9.45, 2.7, 0.1], [0, 2.14, -2.74])
const paintingColors = [0xcf775c, 0x4e8b89, 0xd3af72, 0x7a879a]
for (let i = 0; i < 4; i++) {
  const x = -3.1 + i * 2
  block(atelier, 'framed-artwork', wood, [1.12, 1.2, 0.09], [x, 2.22, -2.65])
  block(atelier, 'abstract-artwork', makeMaterial(`paint-${i}`, paintingColors[i]), [0.99, 1.07, 0.02], [x, 2.22, -2.58])
}
block(atelier, 'work-table', wood, [2.2, 0.12, 0.95], [-2.45, 1.25, 0.5])
for (const x of [-3.35, -1.55]) block(atelier, 'work-table-leg', wood, [0.09, 0.94, 0.09], [x, 0.76, 0.5])
block(atelier, 'easel-top', paper, [0.85, 1.05, 0.05], [1.22, 1.7, 0.3], [-0.13, 0.1, 0])
for (const x of [0.89, 1.55]) block(atelier, 'easel-leg', wood, [0.065, 1.4, 0.065], [x, 0.95, 0.35])
for (const x of [-3.4, -1.3, 1, 3.3]) block(atelier, 'warm-ceiling-lamp', warmLight, [0.28, 0.08, 0.28], [x, 3.34, 0.6])

const rail = group('roof-rail')
const top = 5.54
for (const x of [-4.9, -3.3, -1.65, 0, 1.65, 3.3, 4.9]) {
  for (const z of [-2.9, 2.9]) block(rail, 'vertical-rail-post', paleMetal, [0.065, 1.12, 0.065], [x, 4.98, z])
}
for (const z of [-2.9, -1.45, 0, 1.45, 2.9]) {
  for (const x of [-4.9, 4.9]) block(rail, 'vertical-rail-post', paleMetal, [0.065, 1.12, 0.065], [x, 4.98, z])
}
for (const y of [5.0, top]) {
  for (const z of [-2.9, 2.9]) block(rail, 'long-horizontal-rail', paleMetal, [9.85, 0.055, 0.055], [0, y, z])
  for (const x of [-4.9, 4.9]) block(rail, 'short-horizontal-rail', paleMetal, [0.055, 0.055, 5.85], [x, y, 0])
}

// The light rear rooftop volume and slate gable are visible behind the parapet in the photos.
const upper = group('rear-upper-studio')
block(upper, 'upper-studio-walls', interior, [4.45, 2, 2.25], [-2.2, 4.89, -1.64])
block(upper, 'upper-window', glass, [1.18, 1.1, 0.05], [-2.15, 5.02, -0.47])
for (const x of [-2.77, -1.55]) block(upper, 'upper-window-frame', charcoal, [0.07, 1.16, 0.08], [x, 5.02, -0.43])
block(upper, 'roof-left-slope', roofMetal, [2.56, 0.14, 2.65], [-3.23, 6.2, -1.64], [0, 0, 0.42])
block(upper, 'roof-right-slope', roofMetal, [2.56, 0.14, 2.65], [-1.17, 6.2, -1.64], [0, 0, -0.42])

scene.updateMatrixWorld(true)
const output = fileURLToPath(new URL('../src/assets/models/custom/artist-workshop-180.glb', import.meta.url))
await mkdir(fileURLToPath(new URL('../src/assets/models/custom/', import.meta.url)), { recursive: true })
const exporter = new GLTFExporter()
const arrayBuffer = await exporter.parseAsync(scene, { binary: true, onlyVisible: true })
await writeFile(output, Buffer.from(arrayBuffer))
console.log(`Wrote ${output} (${Math.round(arrayBuffer.byteLength / 1024)} KiB)`)

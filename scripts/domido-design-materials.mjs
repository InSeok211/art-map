import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'

// Map regions of the unmodified design sheet through mesh UVs. The original
// image stays intact: structural details are modeled in CAD, not projected.
export async function loadDomidoDesign(source = new URL('../design/domido-exterior/domido-reference-sheet-v1.png', import.meta.url)) {
  const require = createRequire(import.meta.url)
  let runtime
  try { runtime = require('@napi-rs/canvas') } catch {
    const config = JSON.parse(await readFile(new URL('../.tmp/brep-dependencies.json', import.meta.url), 'utf8'))
    runtime = require(config.canvasModule)
  }
  const image = await runtime.loadImage(fileURLToPath(source))
  const canvas = runtime.createCanvas(image.width, image.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0)
  const pixels = ctx.getImageData(0, 0, image.width, image.height).data
  const texture = new THREE.DataTexture(new Uint8Array(pixels), image.width, image.height, THREE.RGBAFormat)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.flipY = false
  texture.needsUpdate = true
  return { texture, width: image.width, height: image.height, runtime }
}

export function designSurface(part) {
  if (part.name.includes('plaster') || part.name.includes('wall_plinth')) return 'stucco'
  if (part.name.includes('roof') || part.name.includes('gutter') || part.name.includes('recess')) return null
  const [r,g,b] = part.color
  if (r > g * 1.3 && g > b * 1.25 && r < .5) return 'timber'
  return null
}

export function addDesignUvs(geometry, kind, design) {
  const regions = { timber: [873,205,898,233], stucco: [1340,80,1400,105] }
  const [left,top,right,bottom] = regions[kind]
  geometry.computeBoundingBox()
  const bounds = geometry.boundingBox, size = bounds.getSize(new THREE.Vector3())
  const positions = geometry.getAttribute('position'), uv = []
  for(let index=0; index<positions.count; index++) {
    const horizontal = size.x >= size.z
      ? (positions.getX(index)-bounds.min.x)/(size.x || 1)
      : (positions.getZ(index)-bounds.min.z)/(size.z || 1)
    const vertical = (positions.getY(index)-bounds.min.y)/(size.y || 1)
    uv.push((left+horizontal*(right-left))/design.width,
      (top+(1-vertical)*(bottom-top))/design.height)
  }
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2))
}

export function addDesignMural(scene, design) {
  const geometry = new THREE.PlaneGeometry(1.75,1.79)
  const uv = geometry.getAttribute('uv')
  for(let index=0;index<uv.count;index++) {
    const x=uv.getX(index), y=uv.getY(index)
    uv.setXY(index,(1202+x*262)/design.width,(180+(1-y)*244)/design.height)
  }
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({map:design.texture,roughness:1}))
  mesh.name='design_sheet_tiger_mural'
  mesh.position.set(3.73,3.85,2.215)
  scene.add(mesh)
}

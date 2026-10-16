import { existsSync } from 'node:fs'
import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const repo = path.resolve(process.env.USD_BREP_ROOT || path.join(root, '.tmp/usd-brep'))
const domido = process.argv.includes('domido') && process.argv.includes('--building')
const greenhouse = process.argv.includes('greenhouse') && process.argv.includes('--building')
const designVersion = greenhouse || (domido && process.argv.includes('--detail') && process.argv.includes('design'))
const stem = greenhouse ? 'greenhouse-design' : domido ? (designVersion ? 'domido-design' : 'domido') : 'gamcheon-brep-building'
const output = path.join(root, domido || greenhouse ? `.tmp/${stem}` : '.tmp/brep-building')
const python = path.join(repo, '_build/target-deps/python/python.exe')
if (!existsSync(python) || !existsSync(path.join(repo, '_build/windows-x86_64/release/_omni_solid.pyd'))) {
  throw new Error(`USD BRep release build required at ${repo}. See docs/USD_BREP_BUILDINGS.md.`)
}
const run = spawnSync(python, [path.join(root, 'scripts/build-brep-building.py'), '--repo', repo,
  '--output', output, ...process.argv.slice(2)], { cwd: repo, stdio: 'inherit' })
if (run.error) throw run.error
if (run.status !== 0) process.exit(run.status || 1)
const payload = JSON.parse(await readFile(path.join(output, `${stem}.mesh.json`), 'utf8'))
const scene = new THREE.Scene()
scene.name = greenhouse ? 'Greenhouse-design-sheet-CAD-reconstruction' : domido ? 'Domido-photo-based-CAD-reconstruction' : 'GamcheonBrepBuilding'
let triangles = 0
const cadMaterials = new Map()
const designTools = designVersion ? await import(greenhouse ? './greenhouse-design-materials.mjs' : './domido-design-materials.mjs') : null
const design = designTools ? await designTools.loadDomidoDesign() : null
for (const part of payload.parts) {
  const { points, faces } = part.mesh
  const positions = []
  for (let i = 0; i < faces.length;) {
    const count = faces[i++]
    if (count !== 3) throw new Error(`${part.name}: expected CAD tessellator triangle, got ${count}`)
    for (let j = 0; j < count; j++) {
      const point = points[faces[i++]]
      if (!point || point.length !== 3 || !point.every(Number.isFinite)) throw new Error('Invalid mesh point')
      // CAD centimeters Z-up -> glTF meters Y-up; proper rotation preserves winding.
      positions.push(point[0] * 0.01, point[2] * 0.01, -point[1] * 0.01)
    }
    triangles++
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  const surface = designTools?.designSurface(part)
  if (surface) designTools.addDesignUvs(geometry, surface, design)
  // All batches need the same attributes, including UVs on plain CAD parts.
  if (designVersion && !surface) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(positions.length/3*2),2))
  const materialKey = JSON.stringify([surface || part.color, part.opacity ?? 1, part.name.includes('bulb')])
  if (!cadMaterials.has(materialKey)) cadMaterials.set(materialKey, new THREE.MeshStandardMaterial({
    color: surface ? 0xffffff : new THREE.Color(...part.color), roughness: 0.82,
    map: surface ? design.texture : null,
    emissive: part.name.includes('bulb') ? new THREE.Color(1,.55,.18) : 0x000000,
    emissiveIntensity: part.name.includes('bulb') ? 1.4 : 0,
    transparent: (part.opacity ?? 1) < 1, opacity: part.opacity ?? 1,
  }))
  const mesh = new THREE.Mesh(geometry, cadMaterials.get(materialKey))
  mesh.name = part.name
  scene.add(mesh)
}
if (domido || greenhouse) {
  // One batch per CAD material keeps hundreds of awning ribs cheap on the map.
  for (const material of cadMaterials.values()) {
    const parts = scene.children.filter(mesh => mesh.material === material)
    const geometry = mergeGeometries(parts.map(mesh => mesh.geometry))
    if (!geometry) throw new Error('Unable to batch CAD parts')
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `CAD_batch_${parts[0].name}`
    mesh.userData.cadParts = parts.map(part => part.name)
    for (const part of parts) scene.remove(part)
    scene.add(mesh)
  }
  if (domido) {
    const { decorateDomido } = await import('./decorate-domido.mjs')
    await decorateDomido(scene, { design })
  }
  if (designTools) designTools.addDesignMural(scene, design)
}
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(value => { this.result = value; this.onloadend?.() })
  }
}
const glb = await new GLTFExporter().parseAsync(scene, { binary: true })
// Use the same validator as the model upload UI and server.
const { build } = await import('vite')
await build({ configFile: false, logLevel: 'silent', build: { write: true,
  outDir: path.join(root, '.tmp/brep-validator'), emptyOutDir: true, minify: false,
  lib: { entry: path.join(root, 'src/buildings/glbCheck.ts'), formats: ['es'], fileName: () => 'check.mjs' },
} })
const { checkGlb } = await import(new URL('../.tmp/brep-validator/check.mjs', import.meta.url))
const error = checkGlb(glb)
if (error) throw new Error(error)
const target = path.join(output, `${stem}.glb`)
await writeFile(target, Buffer.from(glb))
await copyFile(path.join(root, 'scripts/brep-building-preview.html'), path.join(output, 'preview.html'))
if (domido || greenhouse) {
  let html = await readFile(path.join(output, 'preview.html'), 'utf8')
  html = html.replaceAll('gamcheon-brep-building.glb', `${stem}.glb`)
    .replaceAll('USD BRep로 만든 2층 건물', designVersion ? '도미도 · 디자인 시안 기반 CAD 복원' : '도미도 · 외관 복원 시안')
    .replaceAll('문과 창문 개구부 · 옥상 난간', '사진 기반 CAD · 목재 창호 · 초록 차양 · 박공 입구')
    .replaceAll('제작 경로 검증용 샘플', designVersion ? '디자인 시안 기반 · 치수/깊이 추정 · 구조 CAD / 벽화 재질' : '정면 사진 기반 · 치수/깊이 추정 · 벽화 단순화')
    .replace('camera.position.set(12,10,14)', 'camera.position.set(8,5.3,15)')
    .replace('controls.target.set(0,3,0)', 'controls.target.set(0,2.8,0)')
    .replace('<title>USD BRep 건물 제작 실험</title>', '<title>도미도 외관 복원 · USD BRep</title>')
    .replace('ground.receiveShadow=true;scene.add(ground)', `ground.receiveShadow=true;scene.add(ground)
const { addDomidoStreet } = await import('/scripts/domido-preview-context.mjs'); addDomidoStreet(scene)`)
  if (designVersion) html = html
    .replace('</aside>', `</aside><nav style="position:absolute;top:174px;left:36px;display:flex;gap:8px;z-index:2">
<button id="front-view">정면</button><button id="angle-view">사선</button><button id="entry-view">입구 확대</button>
<a href="/design/domido-exterior/domido-reference-sheet-v1.png" target="_blank" rel="noopener">디자인 시안</a></nav>`)
    .replace('사진 기반 CAD · 목재 창호 · 초록 차양 · 박공 입구', '시안 기반 CAD · 이중 창틀 · 둥근 난간 · 재질 표현')
    .replace('window.modelReady=true', `
 const bounds=new THREE.Box3().setFromObject(gltf.scene), size=bounds.getSize(new THREE.Vector3())
 function fitModel(){
  const distance=Math.max(size.x/(2*Math.tan(camera.fov*Math.PI/360)*camera.aspect),size.y/(2*Math.tan(camera.fov*Math.PI/360)))*1.3
  camera.position.copy(controls.target).add(new THREE.Vector3(8,2.5,15).normalize().multiplyScalar(distance));controls.update()
 }
 fitModel();addEventListener('resize',()=>fitModel())
 document.querySelector('#front-view').onclick=()=>{
  controls.target.set(0,2.8,0);fitModel();const distance=camera.position.distanceTo(controls.target)
  camera.position.copy(controls.target).add(new THREE.Vector3(0,.025,1).normalize().multiplyScalar(distance));controls.update()
 }
 document.querySelector('#angle-view').onclick=()=>{controls.target.set(0,2.8,0);fitModel()}
 document.querySelector('#entry-view').onclick=()=>{controls.target.set(.78,3.4,2.7);camera.position.set(2.1,4.5,7.8);controls.update()}
 window.modelReady=true`)
  if (greenhouse) html = html
    .replaceAll('도미도', '그린하우스')
    .replaceAll('이중 창틀 · 둥근 난간 · 재질 표현', '두 건물 부분 · 중앙 계단 · 테라스 · 벽화')
    .replaceAll('/design/domido-exterior/domido-reference-sheet-v1.png', '/design/greenhouse-exterior/greenhouse-reference-sheet-v1.png')
    .replace('controls.target.set(0,2.8,0)', 'controls.target.set(0,3.1,0)')
    .replace('controls.target.set(.78,3.4,2.7);camera.position.set(2.1,4.5,7.8)', 'controls.target.set(.15,1.7,2.9);camera.position.set(2.3,3.4,8)')
    .replace("const { addDomidoStreet } = await import('/scripts/domido-preview-context.mjs'); addDomidoStreet(scene)", '')
  await writeFile(path.join(output, 'preview.html'), html)
}
const bounds = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3())
console.log(`GLB upload validation passed: ${triangles} triangles, ${glb.byteLength} bytes`)
console.log(`Size (meters): ${bounds.toArray().map(value => value.toFixed(2)).join(' × ')}`)
console.log(target)

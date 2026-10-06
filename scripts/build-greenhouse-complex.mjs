import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// GreenHOUSE / 달과6펜스: a review model based on the supplied five photos and
// footprint sketch. The unseen courtyard and roof joins are interpretive.
class NodeFileReader {
  result = null
  onloadend = null
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((value) => { this.result = value; this.onloadend?.() }) }
  readAsDataURL(blob) { blob.arrayBuffer().then((value) => { this.result = `data:${blob.type};base64,${Buffer.from(value).toString('base64')}`; this.onloadend?.() }) }
}
globalThis.FileReader ??= NodeFileReader

// GLTFExporter normally uses a browser canvas to embed DataTexture pixels.
// This small RGBA-only canvas writes PNGs in Node, keeping the GLB self-contained.
const crcTable=Array.from({length:256},(_,index)=>{let value=index;for(let bit=0;bit<8;bit++)value=(value>>>1)^(value&1?0xedb88320:0);return value>>>0})
function pngChunk(type,data){
  const label=Buffer.from(type), chunk=Buffer.alloc(12+data.length)
  chunk.writeUInt32BE(data.length,0);label.copy(chunk,4);data.copy(chunk,8)
  let crc=0xffffffff
  for(let i=4;i<8+data.length;i++)crc=crcTable[(crc^chunk[i])&255]^(crc>>>8)
  chunk.writeUInt32BE((crc^0xffffffff)>>>0,8+data.length)
  return chunk
}
function encodePng(width,height,rgba){
  const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6
  const rows=Buffer.alloc(height*(1+width*4))
  for(let y=0;y<height;y++)Buffer.from(rgba.buffer,rgba.byteOffset+y*width*4,width*4).copy(rows,y*(1+width*4)+1)
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',header),pngChunk('IDAT',deflateSync(rows)),pngChunk('IEND',Buffer.alloc(0))])
}
globalThis.ImageData ??= class {constructor(data,width,height){this.data=data;this.width=width;this.height=height}}
globalThis.document ??= {createElement(kind){
  if(kind!=='canvas')throw new Error(`Unsupported DOM node: ${kind}`)
  const canvas={width:1,height:1,pixels:null}
  const context={translate(){},scale(){},putImageData(image){canvas.pixels=image.data}}
  canvas.getContext=()=>context
  canvas.toBlob=(callback)=>callback(new Blob([encodePng(canvas.width,canvas.height,canvas.pixels)],{type:'image/png'}))
  return canvas
}}

// 벽화·그림·로고는 각 작가와 가게의 저작물이라 사진을 쓰지 않습니다. 자리마다 사진에서 한 번 구한 대표색(보이는
// 픽셀의 평균)만 남겨 단색 면으로 그리고, 원본 사진 조각은 지웠습니다. 로고 자리는 글자 없는 옅은 판입니다.
const PANEL_COLORS={
  'blue-shop':0x434c4d,
  'butterfly':0x70808e,
  'cafe-sign':0x484b3c,
  'cat':0x544943,
  'gallery-display':0x2c292c,
  'greenhouse-sign':0x465848,
  'vito':0x736b69,
  'west-mural':0x475562,
}
async function photoMaterial(name,stem,width,height,transparent=false){
  const color=new THREE.Color().setHex(PANEL_COLORS[stem]??0xdddddd,THREE.SRGBColorSpace)
  const plainName=name.replace(/-?(from-)?photo-?/g,'-').replace(/^-|-$/g,'')+'-plain'
  return transparent
    ? new THREE.MeshStandardMaterial({name:plainName,color,roughness:0.9,transparent:true,opacity:0.35,side:THREE.DoubleSide,depthWrite:false})
    : new THREE.MeshStandardMaterial({name:plainName,color,roughness:0.9,side:THREE.DoubleSide})
}
function decal(parent,name,material,width,height,position,rotateY=0){
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),material)
  mesh.name=name;mesh.position.set(...position);mesh.rotation.y=rotateY;parent.add(mesh)
  return mesh
}

const scene = new THREE.Scene()
scene.name = 'greenhouse-moon-sixpence-connected-concept'
const mat = (name, color, other = {}) => new THREE.MeshStandardMaterial({ name, color, roughness: 0.82, ...other })
const M = {
  olive: mat('olive-grey-horizontal-plaster', 0x59645a),
  oliveDark: mat('ground-floor-olive', 0x394b33),
  signGreen: mat('greenhouse-lettering', 0x657466),
  white: mat('white-end-walls', 0xe3e7df),
  charcoal: mat('charcoal-metal-roof', 0x353c3c, { metalness: 0.28, roughness: 0.58, side: THREE.DoubleSide }),
  fascia: mat('charcoal-roof-fascia', 0x292f31),
  trim: mat('white-awning-and-window-trim', 0xe8e9e2),
  glass: mat('blue-grey-window-glass', 0x607b80, { metalness: 0.12, roughness: 0.22 }),
  darkGlass: mat('shopfront-dark-glass', 0x273d41, { metalness: 0.12, roughness: 0.28 }),
  greenAwning: mat('deep-green-canvas-awning', 0x344d31),
  yellow: mat('yellow-triangular-entry-paint', 0xe7ae13),
  red: mat('red-post-box', 0x992f33),
  magenta: mat('magenta-cafe-window-frame', 0x8e3c5d),
  flowerPink: mat('flower-pink', 0xc97f96),
  flowerWhite: mat('flower-white', 0xe7e8df),
  leaf: mat('flower-leaf', 0x435c3a),
  muralBack: mat('cat-mural-burgundy', 0x703e43),
  cat: mat('cat-mural-black', 0x242529),
  catWhite: mat('cat-mural-white', 0xe2dfd6),
  gold: mat('mural-gold', 0xdbad49),
  butterfly: mat('butterfly-teal', 0x428c99),
  violet: mat('butterfly-violet', 0x786493),
  brick: mat('courtyard-low-brick', 0x8c5b4f),
  concrete: mat('entry-concrete', 0x989995),
}
const photos={
  cat:await photoMaterial('original-cat-mural-photo','cat',440,500),
  butterfly:await photoMaterial('original-butterfly-mural-photo','butterfly',370,590),
  vito:await photoMaterial('original-VITO-mural-photo','vito',370,660),
  cafe:await photoMaterial('original-cafe-lettering-photo','cafe-sign',770,310),
  logo:await photoMaterial('original-GreenHOUSE-lettering-photo','greenhouse-sign',560,230,true),
  westMural:await photoMaterial('original-west-courtyard-mural-photo','west-mural',570,300),
}
const group = (name) => { const g = new THREE.Group(); g.name = name; scene.add(g); return g }
function box(parent, name, material, size, position, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
  mesh.name = name
  mesh.position.set(...position)
  mesh.rotation.set(...rotation)
  parent.add(mesh)
  return mesh
}
function ellipse(parent, name, material, radiusX, radiusY, depth, position, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), material)
  mesh.name = name
  mesh.scale.set(radiusX, radiusY, depth)
  mesh.position.set(...position)
  mesh.rotation.set(...rotation)
  parent.add(mesh)
}
function line(parent, name, material, a, b, thickness = 0.035) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b)
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(thickness, thickness, start.distanceTo(end), 6), material)
  mesh.name = name
  mesh.position.copy(start).add(end).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize())
  parent.add(mesh)
}
function roofQuad(parent, name, material, a, b, c, d) {
  const positions = [...a, ...b, ...c, ...a, ...c, ...d]
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = name
  parent.add(mesh)
}
function longGable(parent, name, x0, x1, z0, z1, ridgeHeight) {
  // The reference has hipped charcoal ends above flat white front walls.
  // A full gable put a large dark triangle where the photographed sign sits.
  const middle=(x0+x1)/2, eave=H+0.14
  const inset=(x1-x0)*0.44
  const rear=z0+inset, front=z1-inset
  roofQuad(parent,`${name}-west-slope`,M.charcoal,
    [x0,eave,z0],[middle,ridgeHeight,rear],[middle,ridgeHeight,front],[x0,eave,z1])
  roofQuad(parent,`${name}-east-slope`,M.charcoal,
    [middle,ridgeHeight,rear],[x1,eave,z0],[x1,eave,z1],[middle,ridgeHeight,front])
  roofQuad(parent,`${name}-front-hip`,M.charcoal,
    [x0,eave,z1],[middle,ridgeHeight,front],[x1,eave,z1],[x1,eave,z1])
  roofQuad(parent,`${name}-rear-hip`,M.charcoal,
    [x1,eave,z0],[middle,ridgeHeight,rear],[x0,eave,z0],[x0,eave,z0])
  line(parent,`${name}-ridge-cap`,M.fascia,[middle,ridgeHeight+0.035,rear],[middle,ridgeHeight+0.035,front],0.055)
  for(let z=rear+0.3;z<front;z+=0.64){
    line(parent,`${name}-west-standing-seam`,M.fascia,[x0,eave+0.014,z],[middle,ridgeHeight+0.014,z],0.018)
    line(parent,`${name}-east-standing-seam`,M.fascia,[middle,ridgeHeight+0.014,z],[x1,eave+0.014,z],0.018)
  }
  for(const x of [x0,x1])line(parent,`${name}-side-eave`,M.fascia,[x,eave,z0],[x,eave,z1],0.065)
  for(const z of [z0,z1])line(parent,`${name}-end-eave`,M.fascia,[x0,eave,z],[x1,eave,z],0.065)
  for(const [z,r] of [[z0,rear],[z1,front]]){
    line(parent,`${name}-hip-edge`,M.fascia,[x0,eave,z],[middle,ridgeHeight,r],0.055)
    line(parent,`${name}-hip-edge`,M.fascia,[x1,eave,z],[middle,ridgeHeight,r],0.055)
  }
}
function crossGable(parent, name, x0, x1, z0, z1, ridgeHeight) {
  const middle=(z0+z1)/2, eave=H+0.12
  roofQuad(parent, `${name}-north-slope`, M.charcoal,
    [x0,eave,z0],[x0,ridgeHeight,middle],[x1,ridgeHeight,middle],[x1,eave,z0])
  roofQuad(parent, `${name}-south-slope`, M.charcoal,
    [x0,ridgeHeight,middle],[x0,eave,z1],[x1,eave,z1],[x1,ridgeHeight,middle])
  line(parent, `${name}-ridge-cap`, M.fascia, [x0,ridgeHeight+0.03,middle],[x1,ridgeHeight+0.03,middle],0.055)
  for(let x=x0+0.35;x<x1;x+=0.64){
    line(parent,`${name}-standing-seam`,M.fascia,[x,eave+0.01,z0],[x,ridgeHeight+0.01,middle],0.018)
    line(parent,`${name}-standing-seam`,M.fascia,[x,ridgeHeight+0.01,middle],[x,eave+0.01,z1],0.018)
  }
}
// Small geometric lettering stays part of the GLB and is readable from the
// street without relying on a separate web font or a generated image texture.
const GLYPHS = {
  A:['01110','10001','10001','11111','10001','10001','10001'],
  C:['01111','10000','10000','10000','10000','10000','01111'],
  D:['11110','10001','10001','10001','10001','10001','11110'],
  E:['11111','10000','10000','11110','10000','10000','11111'],
  F:['11111','10000','10000','11110','10000','10000','10000'],
  G:['01111','10000','10000','10111','10001','10001','01111'],
  H:['10001','10001','10001','11111','10001','10001','10001'],
  I:['11111','00100','00100','00100','00100','00100','11111'],
  N:['10001','11001','10101','10101','10011','10001','10001'],
  O:['01110','10001','10001','10001','10001','10001','01110'],
  R:['11110','10001','10001','11110','10100','10010','10001'],
  S:['01111','10000','10000','01110','00001','00001','11110'],
  T:['11111','00100','00100','00100','00100','00100','00100'],
  U:['10001','10001','10001','10001','10001','10001','01110'],
  V:['10001','10001','10001','10001','10001','01010','00100'],
  ' ':['00000','00000','00000','00000','00000','00000','00000'],
}
function pixelText(parent, name, message, material, unit, position, rotateY = 0) {
  const geometries = []
  for (let letter = 0; letter < message.length; letter++) {
    const rows = GLYPHS[message[letter].toUpperCase()] ?? GLYPHS[' ']
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) if (rows[row][col] === '1') {
      const geometry = new THREE.BoxGeometry(unit * 0.78, unit * 0.78, 0.018)
      geometry.translate((letter * 6 + col) * unit, (6 - row) * unit, 0)
      geometries.push(geometry)
    }
  }
  const mesh = new THREE.Mesh(mergeGeometries(geometries), material)
  mesh.name = name
  mesh.position.set(...position)
  mesh.rotation.y = rotateY
  parent.add(mesh)
  geometries.forEach((geometry) => geometry.dispose())
}
// Main street frontage is x=8.5. The two white end walls are connected behind
// an open court; there is no separate GreenHOUSE block floating beside the café.
const shell = group('one-connected-U-shaped-building')
const H = 6.45
box(shell, 'green-east-wing', M.olive, [5.5, H, 21], [5.75, H / 2, 0.5])
// The left white front stops several metres behind the café/VITO corner in the
// supplied concept. This stagger is essential to the open yellow stair court.
box(shell, 'white-west-wing', M.white, [4.8, H, 16.5], [-4.2, H / 2, -1.75])
box(shell, 'rear-cross-wing-connecting-both-businesses', M.white, [9.2, H, 4.8], [0.25, H / 2, -7.6])
// White end caps explain the two photographed GreenHOUSE signs at different angles.
box(shell, 'greenhouse-front-end-white', M.white, [5.54, H, 0.13], [5.75, H / 2, 11.07])
box(shell, 'greenhouse-west-end-white', M.white, [4.83, H, 0.13], [-4.2, H / 2, 6.57])
longGable(shell,'east-long-roof',2.65,8.85,-10.4,11.4,H+1.18)
longGable(shell,'west-wing-roof',-6.9,-1.5,-10.4,6.9,H+1.06)
crossGable(shell,'rear-joining-roof',-6.9,8.85,-10.4,-4.9,H+1.1)
// Horizontal plaster reveals, prominent on the photographed long green wall.
const facade = group('green-alley-facade-from-cafe-to-gallery')
for (let y = 3.65; y < 6.15; y += 0.65) box(facade, 'continuous-plaster-seam', M.fascia, [0.025, 0.022, 20.9], [8.515, y, 0.5])
box(facade, 'second-floor-overhang', M.olive, [0.58, 0.16, 21], [8.51, 3.25, 0.5])
box(facade, 'rain-pipe', M.fascia, [0.13, 6.5, 0.13], [8.62, 3.25, -0.4])
for (const [i, z] of [-7.7, -3.75, 0.2, 4.15, 8.1].entries()) {
  box(facade, `upper-window-${i}`, M.glass, [0.045, 1.55, 1.75], [8.54, 4.76, z])
  for (const offset of [-0.9, 0, 0.9]) box(facade, `white-window-mullion-${i}`, M.trim, [0.08, 1.67, 0.07], [8.60, 4.76, z + offset])
  for (const yy of [3.9, 5.62]) box(facade, `white-window-rail-${i}`, M.trim, [0.08, 0.07, 1.9], [8.61, yy, z])
  box(facade, `white-window-hood-${i}`, M.trim, [0.75, 0.13, 2.25], [8.78, 5.72, z], [0, 0, -0.23])
  box(facade, `flower-box-base-${i}`, M.trim, [0.57, 0.07, 2.02], [8.79, 3.91, z])
  for (const zz of [z - 0.97, z + 0.97]) box(facade, `flower-box-side-${i}`, M.trim, [0.58, 0.27, 0.055], [8.79, 4.04, zz])
  for (const yy of [4.01, 4.23]) box(facade, `flower-box-rail-${i}`, M.trim, [0.05, 0.045, 2.01], [9.075, yy, z])
  for (let f = 0; f < 9; f++) {
    const zz = z - 0.83 + f * 0.205
    ellipse(facade, `leaf-${i}-${f}`, M.leaf, 0.10, 0.13, 0.11, [8.82, 4.18, zz])
    ellipse(facade, `flower-${i}-${f}`, f % 3 === 0 ? M.flowerWhite : M.flowerPink, 0.075, 0.065, 0.07, [8.91, 4.29, zz])
  }
}
// Shop order on the east elevation, north to south: blue glass storefront,
// Coffee & Dessert sign and magenta slot, yellow entrance, cat mural, gallery.
box(facade, 'left-shop-glazing', M.darkGlass, [0.065, 2.67, 3.1], [8.56, 1.48, -8.55])
for (const z of [-10.1, -8.45, -7]) box(facade, 'left-shop-white-frame', M.trim, [0.09, 2.75, 0.075], [8.65, 1.5, z])
box(facade, 'left-shop-white-top-frame', M.trim, [0.1, 0.08, 3.22], [8.65, 2.87, -8.55])
box(facade, 'cafe-olive-sign-field', M.oliveDark, [0.07, 2.86, 4.9], [8.57, 1.49, -3.8])
for (const z of [-5.65, -4.8, -3.95, -3.1, -2.25]) ellipse(facade, 'cafe-floral-ornament', M.flowerWhite, 0.09, 0.12, 0.13, [8.68, 2.87, z])
box(facade, 'magenta-cafe-slot', M.magenta, [0.12, 0.39, 4.25], [8.68, 1.24, -3.8])
box(facade, 'cafe-slot-dark-glass', M.darkGlass, [0.13, 0.25, 4.09], [8.75, 1.24, -3.8])
// The yellow paint rises diagonally from both sides of a narrow glazed entry.
const entry = group('yellow-alley-entrance')
const wedge = (name, z0, z1, reversed) => {
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute([
    8.625, 0.12, z0, 8.625, 0.12, z1,
    8.625, 3.07, reversed ? z0 : z1,
  ], 3))
  geom.computeVertexNormals()
  const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ name: 'yellow-entry-mural', color: 0xe7ae13, side: THREE.DoubleSide, roughness: 1 }))
  mesh.name = name; entry.add(mesh)
}
wedge('yellow-left-triangle', -1.1, 0.18, false)
wedge('yellow-right-triangle', 1.42, 2.95, true)
box(entry, 'slim-recessed-glass-door', M.darkGlass, [0.085, 2.45, 1.17], [8.65, 1.47, 0.8])
for (const z of [0.17, 1.43]) box(entry, 'door-jamb', M.trim, [0.13, 2.55, 0.09], [8.72, 1.47, z])
box(entry, 'door-lintel', M.trim, [0.14, 0.1, 1.35], [8.72, 2.76, 0.8])
box(entry, 'yellow-entry-step', M.yellow, [0.52, 0.18, 1.5], [8.85, 0.09, 0.8])
box(entry, 'yellow-entry-lamp', M.trim, [0.38, 0.1, 0.38], [8.8, 3.13, 0.8])
box(entry, 'red-post-box', M.red, [0.25, 0.48, 0.39], [8.79, 1.75, 2.52])
// A simplified, recognisable cat picture rather than a photo texture.
const mural = group('framed-black-cat-mural')
box(mural, 'picture-frame', M.trim, [0.10, 2.18, 1.9], [8.63, 1.61, 4.25])
box(mural, 'burgundy-picture-ground', M.muralBack, [0.11, 2.0, 1.73], [8.7, 1.61, 4.25])
ellipse(mural, 'black-cat-body', M.cat, 0.055, 0.57, 0.5, [8.78, 1.13, 4.25])
ellipse(mural, 'black-cat-head', M.cat, 0.06, 0.38, 0.43, [8.79, 2.02, 4.25])
for (const z of [3.93, 4.56]) ellipse(mural, 'cat-ears', M.cat, 0.07, 0.21, 0.13, [8.8, 2.39, z])
ellipse(mural, 'white-cat-bib', M.catWhite, 0.07, 0.34, 0.25, [8.86, 1.42, 4.25])
for (const z of [4.06, 4.45]) ellipse(mural, 'gold-cat-eye', M.gold, 0.025, 0.04, 0.045, [8.86, 2.12, z])
for (const z of [3.56, 4.9]) ellipse(mural, 'banana-mural-accent', M.gold, 0.025, 0.18, 0.1, [8.8, 1.9, z], [0, 0, 0.35])
box(facade, 'gallery-dark-glass', M.darkGlass, [0.085, 2.65, 5.0], [8.56, 1.46, 8.15])
for (const z of [5.65, 8.1, 10.65]) box(facade, 'gallery-white-mullion', M.trim, [0.1, 2.77, 0.085], [8.66, 1.5, z])
box(facade, 'gallery-green-awning', M.greenAwning, [1.28, 0.09, 5.5], [8.96, 3.13, 8.15], [0, 0, -0.14])
box(facade, 'gallery-striped-bench', M.magenta, [0.65, 0.13, 2.45], [9.15, 0.4, 8.4])

// In the photographs the street is read from the white end toward the rear:
// glass storefront, café, yellow entrance, cat mural, then gallery. Mirror only
// those east-face details so that order is correct from that approach.
for (const part of [facade, entry, mural]) {
  part.scale.z = -1
  part.position.z = 1
}
const details = group('storefront-art-and-display')
decal(details,'photo-accurate-cafe-sign-and-flowers',photos.cafe,4.45,1.25,[8.86,2.33,4.9],Math.PI/2)
decal(details,'photo-accurate-cat-mural',photos.cat,1.75,2.0,[8.96,1.62,-3.25],Math.PI/2)
// The left blue window is a painted storefront, not an empty dark aperture.
const blueTones = [0x5d8fa4,0x79aab7,0xacc7c4,0x406d86,0xd6ddd5]
for (let i=0;i<18;i++) {
  const z=8.28+(i%6)*0.32, y=0.42+Math.floor(i/6)*0.39
  const material=mat(`blue-mural-tone-${i}`,blueTones[(i*7)%blueTones.length])
  box(details,`blue-painted-street-scene-${i}`,material,[0.018,0.22+(i%3)*0.06,0.24],[8.70,y,z])
}
// Postcards and small paintings are visible through the art-gallery window.
const artTones=[0xb76650,0x427d88,0xc7ac66,0x855c88,0x587e5b,0xd4c7a6,0x345568,0xd79969]
for(let row=0;row<3;row++)for(let col=0;col<9;col++){
  const z=-9.25+col*0.42, y=0.76+row*0.58
  box(details,`gallery-art-frame-${row}-${col}`,M.trim,[0.03,0.47,0.33],[8.70,y,z])
  box(details,`gallery-art-${row}-${col}`,mat(`gallery-artwork-${row}-${col}`,artTones[(row*5+col*3)%artTones.length]),[0.035,0.36,0.25],[8.73,y,z])
  box(details,`gallery-art-mark-${row}-${col}`,M.gold,[0.038,0.08,0.12],[8.753,y-0.08,z+0.025])
}
for(let col=0;col<5;col++) box(details,`gallery-lower-display-${col}`,M.trim,[0.04,0.37,0.50],[8.72,0.43,-9.2+col*0.75])
// Alternating bright slats make the low bench legible at the map's tilted view.
for(let i=0;i<13;i++) box(details,`striped-gallery-bench-${i}`,i%2?M.gold:M.magenta,[0.67,0.018,0.14],[9.16,0.48,-8.9+i*0.18])

// White photographed end: GreenHOUSE branding surfaces, VITO artwork, butterfly,
// a single upper planter window and a small lower colourful court.
const end = group('two-white-front-ends-and-courtyard')
const court=group('open-courtyard-facing-walls')
box(court,'open-courtyard-paving',M.concrete,[4.75,0.07,16.15],[0.55,0.035,2.9])
for(const [side,x,direction] of [['west',-1.77,1],['east',2.99,-1]]) {
  for(const [i,z] of [-2.7,1.25,5.2].entries()) {
    box(court,`${side}-court-upper-window-${i}`,M.glass,[0.045,1.45,1.5],[x+direction*0.035,4.78,z])
    for(const zz of [z-0.79,z,z+0.79]) box(court,`${side}-court-window-mullion-${i}`,M.trim,[0.08,1.56,0.06],[x+direction*0.09,4.78,zz])
    for(const yy of [4.03,5.53])box(court,`${side}-court-window-rail-${i}`,M.trim,[0.09,0.06,1.63],[x+direction*0.09,yy,z])
    box(court,`${side}-court-upper-hood-${i}`,M.trim,[0.66,0.11,1.82],[x+direction*0.28,5.67,z])
    box(court,`${side}-court-flowerbox-${i}`,M.trim,[0.45,0.19,1.7],[x+direction*0.29,3.91,z])
    for(let flower=0;flower<7;flower++)ellipse(court,`${side}-court-flower-${i}-${flower}`,flower%2?M.flowerWhite:M.flowerPink,0.07,0.07,0.08,[x+direction*0.31,4.07,z-0.68+flower*0.22])
  }
  const doorZ=side==='west'?3.25:6.7
  box(court,`${side}-court-lower-glass-door`,M.darkGlass,[0.06,2.45,1.3],[x+direction*0.055,1.42,doorZ])
  for(const zz of [doorZ-0.7,doorZ+0.7])box(court,`${side}-court-lower-door-jamb`,M.trim,[0.1,2.55,0.07],[x+direction*0.11,1.42,zz])
  box(court,`${side}-court-lower-door-hood`,M.greenAwning,[0.86,0.09,1.75],[x+direction*0.36,2.99,doorZ])
  box(court,`${side}-court-door-step`,M.concrete,[0.72,0.17,1.6],[x+direction*0.39,0.09,doorZ])
}
box(court,'rear-courtyard-glass-entry',M.darkGlass,[2.4,2.52,0.09],[0.45,1.4,-5.14])
for(const x of [-0.8,0.45,1.7])box(court,'rear-courtyard-white-door-frame',M.trim,[0.08,2.6,0.1],[x,1.42,-5.08])
box(court,'rear-courtyard-wide-awning',M.greenAwning,[3.3,0.11,1.0],[0.45,3.08,-4.82])
for(const x of [-0.35,1.45])for(const z of [8.2,10.6])line(court,'yellow-court-stair-rail',M.yellow,[x,1.12,z],[x,2.2,z-0.2],0.045)
decal(end,'photo-accurate-butterfly-mural',photos.butterfly,1.55,2.0,[4.52,1.55,11.39])
decal(end,'photo-accurate-VITO-mural',photos.vito,1.70,2.08,[6.55,1.57,11.40])
function whiteEndWindow(z, x, canopyGreen) {
  box(end, 'upper-white-end-window', M.glass, [1.8, 1.55, 0.06], [x, 4.75, z])
  for (const xx of [x - 0.92, x, x + 0.92]) box(end, 'upper-white-end-mullion', M.trim, [0.07, 1.67, 0.08], [xx, 4.75, z + 0.06])
  box(end, 'end-window-hood', canopyGreen ? M.greenAwning : M.trim, [2.17, 0.13, 0.66], [x, 5.72, z + 0.27], [-0.18, 0, 0])
  box(end, 'end-flowerbox', M.trim, [1.98, 0.2, 0.48], [x, 3.97, z + 0.28])
  for (let i = 0; i < 8; i++) ellipse(end, 'end-flower', i % 2 ? M.flowerPink : M.flowerWhite, 0.075, 0.065, 0.07, [x - 0.75 + i * 0.21, 4.13, z + 0.32])
}
whiteEndWindow(11.15, 5.75, true)
decal(end,'photo-accurate-GreenHOUSE-main-sign',photos.logo,2.75,1.13,[5.22,3.27,11.38])
decal(end,'photo-accurate-GreenHOUSE-west-sign',photos.logo,3.05,1.25,[-4.08,4.52,6.81])
// Exterior mural panels are shallow geometry, so they remain legible on map.
box(end, 'vito-sign-orange-panel', M.gold, [1.65, 1.18, 0.075], [6.55, 1.87, 11.19])
pixelText(end, 'VITO-mural-lettering', 'VITO', M.oliveDark, 0.048, [5.98, 2.11, 11.28])
ellipse(end, 'vito-fountain-circle', M.concrete, 0.59, 0.59, 0.045, [6.55, 1.5, 11.25])
ellipse(end, 'butterfly-left-wing', M.butterfly, 0.48, 0.62, 0.05, [4.45, 1.55, 11.24], [0, 0, 0.42])
ellipse(end, 'butterfly-right-wing', M.violet, 0.34, 0.47, 0.05, [4.95, 1.39, 11.24], [0, 0, -0.35])
box(end, 'low-courtyard-brick-edge', M.brick, [4.9, 0.55, 0.24], [0.55, 0.28, 11.15])
for(let step=0;step<5;step++) box(end,`yellow-courtyard-step-${step}`,M.yellow,[1.7,0.22,0.50],[0.55,0.11+step*0.22,10.6-step*0.49])
box(end,'yellow-stair-landing',M.yellow,[1.7,0.16,1.0],[0.55,1.10,8.2])
for (const x of [-0.35, 1.45]) for (const z of [8.2, 10.6]) box(end, 'stair-rail-post', M.yellow, [0.07, 2.3, 0.07], [x, 1.47, z])
box(end, 'rear-courtyard-glass-door', M.darkGlass, [1.8, 2.45, 0.055], [0.8, 1.4, -5.12])
box(end, 'west-end-blue-sky-mural', M.butterfly, [3.9, 1.33, 0.06], [-4.2, 0.72, 6.70])
decal(end,'photo-accurate-west-courtyard-mural',photos.westMural,3.9,1.33,[-4.2,0.72,6.82])
for(let i=0;i<14;i++) {
  const x=-5.92+(i%7)*0.55, y=0.35+Math.floor(i/7)*0.50
  box(end,`west-end-painted-townhouse-${i}`,mat(`town-mural-color-${i}`,[0x9caa9b,0xddba70,0x739db0,0x977c92,0xca8f70][i%5]),[0.36,0.30,0.022],[x,y,6.76])
  box(end,`west-end-painted-window-${i}`,M.darkGlass,[0.12,0.12,0.026],[x,y,6.783])
}
box(end,'west-end-lower-window',M.darkGlass,[1.65,1.02,0.065],[-4.2,1.88,6.74])
box(end,'west-end-lower-green-hood',M.greenAwning,[1.95,0.12,0.66],[-4.2,2.50,7.00],[-0.18,0,0])
for(const x of [-4.75,-3.68]) ellipse(end,'west-end-small-figurine',M.gold,0.13,0.26,0.15,[x,3.28,6.82])
box(end,'west-end-figurine-shelf',M.brick,[1.3,0.08,0.25],[-4.2,2.94,6.90])

// The left wing bends inward toward the courtyard at its front end.
// Pivot at the rear connection so the one-building U remains joined.
const westPivot=new THREE.Vector3(-4.2,0,-7.6)
const westAngle=0.14
const westBend=new THREE.Matrix4()
  .makeTranslation(...westPivot.toArray())
  .multiply(new THREE.Matrix4().makeRotationY(westAngle))
  .multiply(new THREE.Matrix4().makeTranslation(...westPivot.clone().negate().toArray()))
for(const [parent,pick] of [
  [shell,(name)=>name==='white-west-wing'||name==='greenhouse-west-end-white'||name.startsWith('west-wing-roof')],
  [court,(name)=>name.startsWith('west-court')],
  [end,(name)=>name.startsWith('west-end')||name==='photo-accurate-GreenHOUSE-west-sign'||name==='photo-accurate-west-courtyard-mural'],
]) for(const mesh of parent.children) if(pick(mesh.name)){
  mesh.updateMatrix()
  mesh.matrix.premultiply(westBend)
  mesh.matrix.decompose(mesh.position,mesh.quaternion,mesh.scale)
}

scene.updateMatrixWorld(true)
const output = fileURLToPath(new URL('../src/assets/models/custom/greenhouse-sixpence-connected.glb', import.meta.url))
await mkdir(fileURLToPath(new URL('../src/assets/models/custom/', import.meta.url)), { recursive: true })
const bytes = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true })
await writeFile(output, Buffer.from(bytes))
console.log(`Wrote ${output} (${Math.round(bytes.byteLength / 1024)} KiB)`)

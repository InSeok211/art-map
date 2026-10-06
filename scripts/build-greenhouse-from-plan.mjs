import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'

globalThis.FileReader ??= class {
  result=null
  onloadend=null
  readAsArrayBuffer(blob){blob.arrayBuffer().then((value)=>{this.result=value;this.onloadend?.()})}
  readAsDataURL(blob){blob.arrayBuffer().then((value)=>{this.result=`data:${blob.type};base64,${Buffer.from(value).toString('base64')}`;this.onloadend?.()})}
}
const crcTable=Array.from({length:256},(_,index)=>{let value=index;for(let bit=0;bit<8;bit++)value=(value>>>1)^(value&1?0xedb88320:0);return value>>>0})
function pngChunk(type,data){
  const label=Buffer.from(type),chunk=Buffer.alloc(12+data.length)
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

// Traced from the user's north-up plan image. The right edge follows
// 감내1로175번길; the lower notch is the space between the two front ends.
const trace = {
  A:[39,153], B:[145,65], C:[209,40], D:[254,143], E:[263,280],
  F:[188,283], G:[174,190], H:[139,213], I:[169,281], J:[126,327],
}
const world=([px,py])=>new THREE.Vector3((px-151)*0.076,0,(py-183)*0.076)
const P=Object.fromEntries(Object.entries(trace).map(([key,point])=>[key,world(point)]))
const scene=new THREE.Scene()
scene.name='GreenHOUSE-Moon-and-Sixpence-plan-matched-structure'
const mat=(name,color,extra={})=>new THREE.MeshStandardMaterial({name,color,roughness:0.8,side:THREE.DoubleSide,...extra})
function grainTexture(seed,amplitude=12){
  const size=128,data=new Uint8Array(size*size*4)
  let state=seed
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    state=(Math.imul(state,1664525)+1013904223)>>>0
    const grain=244+((state>>>24)%amplitude)-amplitude/2
    const index=(y*size+x)*4
    data[index]=data[index+1]=data[index+2]=Math.max(0,Math.min(255,grain))
    data[index+3]=255
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat)
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping
  texture.colorSpace=THREE.SRGBColorSpace
  texture.needsUpdate=true
  return texture
}
const M={
  white:mat('white-plaster-walls',0xdfe2d9,{map:grainTexture(17,9)}),
  olive:mat('olive-green-alley-wall',0x717b71,{map:grainTexture(31,15)}),
  oliveDark:mat('ground-floor-green',0x4f6047,{map:grainTexture(47,15)}),
  roof:mat('charcoal-standing-seam-roof',0x414648,{map:grainTexture(73,10),metalness:0.18,roughness:0.78}),
  fascia:mat('charcoal-fascia',0x262a2c),
  trim:mat('white-window-frames',0xe7e9e3),
  glass:mat('grey-blue-glass',0x557078,{metalness:0.13,roughness:0.25}),
  darkGlass:mat('gallery-dark-glass',0x283a3e,{metalness:0.18,roughness:0.24}),
  yellow:mat('yellow-entrance',0xe5ac17),
  brick:mat('brick-courtyard-edge',0x925a4a),
  paving:mat('courtyard-paving',0xb4b3ac),
  greenAwning:mat('deep-green-awning',0x344d35),
  flower:mat('flower-boxes',0xe8e9e0),
  pink:mat('flowers',0xcf839c),
  cream:mat('cream-flowers',0xe2d5c6),
  rose:mat('rose-flowers',0xb46f82),
  leaf:mat('flower-foliage',0x65795c),
  mural:mat('mural-panels',0x658a9c),
  cat:mat('cat-artwork',0x523942),
  red:mat('red-post-box',0x96363c),
}
const photos={
  cat:await photoMaterial('black-cat-artwork-from-photo','cat',440,500),
  butterfly:await photoMaterial('butterfly-mural-from-photo','butterfly',370,590),
  vito:await photoMaterial('VITO-mural-from-photo','vito',370,660),
  cafe:await photoMaterial('cafe-sign-from-photo','cafe-sign',770,310),
  logo:await photoMaterial('GreenHOUSE-sign-from-photo','greenhouse-sign',560,230,true),
  west:await photoMaterial('west-courtyard-mural-from-photo','west-mural',570,300),
  blueShop:await photoMaterial('blue-painted-shop-window-from-photo','blue-shop',420,630),
  gallery:await photoMaterial('art-gallery-window-from-photo','gallery-display',420,510),
}
const shell=new THREE.Group();shell.name='single-concave-footprint-from-user-plan';scene.add(shell)
const eave=6.68, ridge=7.35
function mesh(name,geometry,material,parent=shell){const object=new THREE.Mesh(geometry,material);object.name=name;parent.add(object);return object}
function box(name,size,position,material,parent=shell){const object=mesh(name,new THREE.BoxGeometry(...size),material,parent);object.position.set(...position);return object}
function line(name,a,b,radius=0.045,material=M.fascia){
  const v1=new THREE.Vector3(...a),v2=new THREE.Vector3(...b)
  const object=mesh(name,new THREE.CylinderGeometry(radius,radius,v1.distanceTo(v2),6),material)
  object.position.copy(v1).add(v2).multiplyScalar(0.5)
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v2.sub(v1).normalize())
  return object
}
function tri(name,a,b,c,material=M.roof){
  const geometry=new THREE.BufferGeometry()
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([...a,...b,...c],3))
  const uv=(point)=>material===M.roof?[point[0]*0.16,point[2]*0.16]:[point[0]*0.12+point[2]*0.10,point[1]*0.30]
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute([...uv(a),...uv(b),...uv(c)],2))
  geometry.computeVertexNormals()
  return mesh(name,geometry,material)
}
const ring=['A','B','C','D','E','F','G','H','I','J']
for(let i=0;i<ring.length;i++){
  const start=P[ring[i]],end=P[ring[(i+1)%ring.length]]
  const wallMaterial=['C','D','F'].includes(ring[i])?M.olive:M.white
  tri(`outer-wall-${ring[i]}-${ring[(i+1)%ring.length]}`,
    [start.x,0,start.z],[end.x,0,end.z],[end.x,eave,end.z],wallMaterial)
  tri(`outer-wall-${ring[i]}-${ring[(i+1)%ring.length]}-upper`,
    [start.x,0,start.z],[end.x,eave,end.z],[start.x,eave,start.z],wallMaterial)
  line(`roof-perimeter-${ring[i]}`,[start.x,eave,start.z],[end.x,eave,end.z],0.07)
}
// The three connected roof masses exactly cover the traced polygon. Their
// shared edges meet; no rectangular roof projects across the central notch.
function roofZone(name,labels,center){
  const peak=world(center);peak.y=ridge
  for(let i=0;i<labels.length;i++){
    const a=P[labels[i]],b=P[labels[(i+1)%labels.length]]
    tri(`${name}-roof-plane-${i}`,[a.x,eave,a.z],[b.x,eave,b.z],[peak.x,peak.y,peak.z])
  }
}
roofZone('northwest-main-volume',['A','B','C','D','G','H'],[159,144])
roofZone('southwest-front-volume',['A','H','I','J'],[123,237])
roofZone('east-alley-volume',['D','E','F','G'],[220,226])

// Facade elements are located on the same traced edges, rather than the old
// parallel rectangular blocks. This keeps them attached as the plan changes.
function panel(name,startKey,endKey,t,y,width,height,material,outward=0.08){
  const a=P[startKey],b=P[endKey],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)
  const nx=dz/len,nz=-dx/len
  const object=mesh(name,new THREE.PlaneGeometry(width,height),material)
  object.position.set(a.x+dx*t+nx*outward,y,a.z+dz*t+nz*outward)
  object.rotation.y=Math.atan2(-dz,dx)+Math.PI
  return object
}
function wallBox(name,startKey,endKey,t,y,width,height,depth,material,outward=0.18){
  const a=P[startKey],b=P[endKey],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)
  const nx=dz/len,nz=-dx/len
  const object=box(name,[width,height,depth],[a.x+dx*t+nx*outward,y,a.z+dz*t+nz*outward],material)
  object.rotation.y=Math.atan2(-dz,dx)+Math.PI
  return object
}
function wallPoint(startKey,endKey,t,y,outward=0.16){
  const a=P[startKey],b=P[endKey],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)
  return [a.x+dx*t+dz/len*outward,y,a.z+dz*t-dx/len*outward]
}
function flowerCluster(name,startKey,endKey,t){
  for(let j=-3;j<=3;j++){
    const shifted=t+j*0.017
    const foliage=mesh(`${name}-foliage-${j}`,new THREE.SphereGeometry(0.115,6,4),M.leaf)
    foliage.position.set(...wallPoint(startKey,endKey,shifted,4.20+(j%3)*0.025,0.38))
    const blossom=mesh(`${name}-blossom-${j}`,new THREE.SphereGeometry(0.062+(j%2)*0.015,6,4),[M.pink,M.cream,M.rose][(j+6)%3])
    blossom.position.set(...wallPoint(startKey,endKey,shifted+0.005,4.29+(j%3)*0.035,0.47))
  }
}
function slopedAwning(name,startKey,endKey,t,y,width,depth,drop,material){
  const a=P[startKey],b=P[endKey],len=a.distanceTo(b),half=width/(2*len)
  const upperLeft=wallPoint(startKey,endKey,t-half,y,0.07)
  const upperRight=wallPoint(startKey,endKey,t+half,y,0.07)
  const lowerLeft=wallPoint(startKey,endKey,t-half,y-drop,depth)
  const lowerRight=wallPoint(startKey,endKey,t+half,y-drop,depth)
  tri(`${name}-left-slope`,upperLeft,lowerLeft,lowerRight,material)
  tri(`${name}-right-slope`,upperLeft,lowerRight,upperRight,material)
  line(`${name}-front-lip`,lowerLeft,lowerRight,0.045,material)
}
// Long road elevation: five upper flower windows and the recognisable lower
// entrance/gallery sequence, following the slightly skewed D-E edge.
for(let i=0;i<5;i++){
  const t=0.11+i*0.19
  panel(`road-upper-glass-${i}`,'D','E',t,4.84,1.35,1.35,M.glass)
  panel(`road-upper-white-frame-${i}`,'D','E',t,4.84,1.50,1.50,M.trim,0.10)
  panel(`road-upper-glass-overlay-${i}`,'D','E',t,4.84,1.32,1.32,M.glass,0.12)
  wallBox(`road-window-center-mullion-${i}`,'D','E',t,4.84,0.045,1.34,0.045,M.trim,0.16)
  slopedAwning(`road-projecting-white-window-hood-${i}`,'D','E',t,5.86,1.70,0.68,0.28,M.trim)
  wallBox(`road-flower-box-${i}`,'D','E',t,4.02,1.53,0.23,0.39,M.flower,0.29)
  for(const offset of [-0.65,0,0.65])wallBox(`road-flower-box-rail-${i}-${offset}`,'D','E',t+offset/10.45,4.18,0.035,0.32,0.035,M.trim,0.52)
  flowerCluster(`road-window-${i}`,'D','E',t)
}
for(const y of [3.46,4.08,4.70,5.32,5.94]){
  const a=wallPoint('D','E',0.02,y,0.025),b=wallPoint('D','E',0.98,y,0.025)
  line(`continuous-horizontal-plaster-course-${y}`,a,b,0.007,M.oliveDark)
}
wallBox('second-floor-overhang','D','E',0.50,3.29,10.42,0.17,0.38,M.olive,0.18)
wallBox('road-rain-downpipe','D','E',0.405,3.34,0.075,6.56,0.075,M.fascia,0.19)
wallBox('road-rain-pipe-joint','D','E',0.405,3.54,0.13,0.09,0.12,M.fascia,0.23)
panel('gallery-shop-window','D','E',0.12,1.46,2.20,2.65,M.darkGlass)
panel('art-gallery-window-photo','D','E',0.12,1.46,2.20,2.65,photos.gallery,0.15)
wallBox('gallery-long-green-awning','D','E',0.12,3.10,2.45,0.13,0.92,M.greenAwning,0.50)
for(const shift of [-0.75,0,0.75])wallBox(`gallery-white-mullion-${shift}`,'D','E',0.12+shift/10.45,1.46,0.07,2.68,0.10,M.trim,0.17)
wallBox('gallery-stripy-bench-base','D','E',0.12,0.31,1.70,0.14,0.55,M.red,0.90)
for(let i=0;i<9;i++)wallBox(`gallery-orange-bench-slat-${i}`,'D','E',0.12+(i-4)*0.018,0.40,0.13,0.025,0.57,i%2?M.yellow:M.red,0.93)
panel('framed-cat-mural','D','E',0.31,1.57,1.40,2.05,M.cat,0.14)
panel('cat-mural-photo','D','E',0.31,1.57,1.40,2.05,photos.cat,0.18)
tri('left-yellow-entry-splay',wallPoint('D','E',0.39,0.02,0.20),wallPoint('D','E',0.44,0.02,0.20),wallPoint('D','E',0.44,3.02,0.20),M.yellow)
tri('right-yellow-entry-splay',wallPoint('D','E',0.52,3.02,0.20),wallPoint('D','E',0.52,0.02,0.20),wallPoint('D','E',0.57,0.02,0.20),M.yellow)
panel('glass-entry-door','D','E',0.48,1.36,0.84,2.53,M.darkGlass,0.22)
wallBox('entry-glass-door-frame','D','E',0.48,1.36,0.98,2.61,0.07,M.trim,0.20)
panel('entry-glass-inset','D','E',0.48,1.36,0.82,2.47,M.darkGlass,0.26)
wallBox('small-red-post-box','D','E',0.56,1.71,0.30,0.48,0.24,M.red,0.34)
wallBox('entrance-step','D','E',0.48,0.11,1.22,0.19,0.54,M.yellow,0.46)
panel('cafe-olive-field','D','E',0.68,1.50,2.50,2.85,M.oliveDark)
panel('cafe-magenta-slot','D','E',0.68,1.25,2.23,0.38,mat('magenta-cafe-window',0x914260),0.16)
panel('cafe-lettering-photo','D','E',0.68,2.20,2.50,1.09,photos.cafe,0.17)
panel('front-blue-shop-glazing','D','E',0.90,1.45,1.80,2.70,M.darkGlass,0.12)
panel('front-blue-painted-shop-photo','D','E',0.90,1.45,1.80,2.70,photos.blueShop,0.17)
wallBox('front-shop-green-awning','D','E',0.90,3.10,1.98,0.11,0.83,M.greenAwning,0.45)
// The angled C-D edge is the continuation of the same entrance-side building.
// In the reference photo its upper olive wall, flower windows, and gallery
// glazing carry past the corner; it must not read as a blank end wall.
for(let i=0;i<3;i++){
  const t=0.18+i*0.31
  panel(`gallery-wing-upper-frame-${i}`,'C','D',t,4.84,1.58,1.50,M.trim,0.10)
  panel(`gallery-wing-upper-glass-${i}`,'C','D',t,4.84,1.39,1.35,M.glass,0.13)
  wallBox(`gallery-wing-window-mullion-${i}`,'C','D',t,4.84,0.045,1.35,0.045,M.trim,0.16)
  slopedAwning(`gallery-wing-white-hood-${i}`,'C','D',t,5.87,1.78,0.66,0.28,M.trim)
  wallBox(`gallery-wing-flower-box-${i}`,'C','D',t,4.02,1.55,0.23,0.39,M.flower,0.29)
  flowerCluster(`gallery-wing-window-${i}`,'C','D',t)
}
for(const y of [3.46,4.08,4.70,5.32,5.94]){
  line(`gallery-wing-plaster-course-${y}`,wallPoint('C','D',0.02,y,0.025),wallPoint('C','D',0.98,y,0.025),0.007,M.oliveDark)
}
wallBox('gallery-wing-upper-overhang','C','D',0.50,3.29,8.35,0.17,0.38,M.olive,0.18)
wallBox('gallery-wing-rain-downpipe','C','D',0.975,3.34,0.075,6.56,0.075,M.fascia,0.19)
panel('gallery-wing-glazed-storefront','C','D',0.51,1.49,7.65,2.73,M.darkGlass,0.11)
panel('gallery-wing-art-display','C','D',0.52,1.49,3.52,2.62,photos.gallery,0.15)
for(const t of [0.11,0.34,0.56,0.79,0.94])wallBox(`gallery-wing-white-mullion-${t}`,'C','D',t,1.49,0.08,2.73,0.09,M.trim,0.18)
slopedAwning('gallery-wing-long-green-awning','C','D',0.50,3.32,8.38,0.91,0.26,M.greenAwning)
// The white GreenHOUSE front closes the east strip along E-F.
panel('east-white-upper-window','E','F',0.48,4.79,1.55,1.47,M.glass,0.13)
panel('east-white-window-hood','E','F',0.48,5.67,1.89,0.18,M.greenAwning,0.17)
panel('east-white-flower-box','E','F',0.48,3.98,1.79,0.24,M.flower,0.20)
panel('east-butterfly-art','E','F',0.74,1.50,1.2,1.55,M.mural,0.16)
panel('east-VITO-art','E','F',0.27,1.50,1.2,1.55,M.cat,0.16)
panel('east-butterfly-photo','E','F',0.74,1.50,1.2,1.55,photos.butterfly,0.20)
panel('east-VITO-photo','E','F',0.27,1.50,1.2,1.55,photos.vito,0.20)
panel('east-GreenHOUSE-sign','E','F',0.50,3.08,2.18,0.90,photos.logo,0.21)
// The southwest front is diagonal in plan, and ends at the inward notch.
panel('west-blue-painted-town','I','J',0.53,0.82,2.62,1.54,M.mural,0.14)
panel('west-painted-town-photo','I','J',0.53,0.82,2.62,1.54,photos.west,0.17)
panel('west-lower-window','I','J',0.53,1.91,1.48,1.08,M.glass,0.18)
panel('west-lower-green-hood','I','J',0.53,2.59,1.76,0.17,M.greenAwning,0.20)
panel('west-GreenHOUSE-sign','I','J',0.53,4.23,2.14,0.88,photos.logo,0.21)
// A short stair lands in the open cutout instead of occupying an invented
// straight central corridor.
for(let i=0;i<5;i++)box(`yellow-courtyard-step-${i}`,[1.28,0.17,0.40],[-0.16,0.09+i*0.17,7.07-i*0.42],M.yellow)
box('courtyard-brick-front-edge',[4.3,0.34,0.20],[0.37,0.17,7.89],M.brick)

scene.updateMatrixWorld(true)
const output=fileURLToPath(new URL('../src/assets/models/custom/greenhouse-sixpence-connected.glb',import.meta.url))
await mkdir(fileURLToPath(new URL('../src/assets/models/custom/',import.meta.url)),{recursive:true})
const bytes=await new GLTFExporter().parseAsync(scene,{binary:true,onlyVisible:true})
await writeFile(output,Buffer.from(bytes))
console.log(`Wrote ${output} (${Math.round(bytes.byteLength/1024)} KiB)`)
